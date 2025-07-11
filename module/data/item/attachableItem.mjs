import BaseDataItem from './base.mjs';

/**
 * Base data model for items that can have attachments (armor, weapons, etc.)
 */
export default class AttachableItem extends BaseDataItem {
    /** @inheritDoc */
    static defineSchema() {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),
            equipped: new fields.BooleanField({ initial: false }),
            attached: new fields.ArrayField(new fields.DocumentUUIDField({ type: "Item", nullable: true }))
        };
    }

    /**
     * Handle equipped status changes for attachment effects
     */
    async _preUpdate(changes, options, user) {
        const allowed = await super._preUpdate(changes, options, user);
        if (allowed === false) return false;

        // Store the previous equipped status for attachment handling
        if (changes.system?.equipped !== undefined) {
            options.previousEquipped = this.equipped;
        }

        return allowed;
    }

    /**
     * Handle attachment effects when equipped status changes
     */
    async _onUpdate(changed, options, user) {
        await super._onUpdate(changed, options, user);
        
        // Handle attachment effects when equipped status changes
        if (changed.system?.equipped !== undefined && options.previousEquipped !== changed.system.equipped) {
            const newEquippedStatus = changed.system.equipped;
            const parentType = ['armor', 'weapon'].includes(this.parent.type) ? this.parent.type : null;
            
            if (parentType) {
                try {
                    await this._handleAttachmentEffectsOnEquipChange(newEquippedStatus, parentType);
                } catch (error) {
                    console.error('DH | Error in handleAttachmentEffectsOnEquipChange:', error);
                }
            }
        }
    }

    /**
     * Handle adding/removing attachment effects when a parent item is equipped/unequipped
     * @param {boolean} newEquippedStatus - The new equipped status
     * @param {string} parentType - Type of parent item ("armor" or "weapon")
     */
    async _handleAttachmentEffectsOnEquipChange(newEquippedStatus, parentType) {
        const actor = this.parent?.type === 'character' ? this.parent : this.parent?.parent;
        
        if (!actor || !this.attached?.length) {
            return;
        }

        if (newEquippedStatus) {
            // Item is being equipped - add attachment effects
            for (const attachedUuid of this.attached) {
                const attachedItem = await fromUuid(attachedUuid);
                if (attachedItem && attachedItem.effects.size > 0) {
                    await this._copyAttachmentEffectsToActor(attachedItem, attachedUuid, parentType, actor);
                }
            }
        } else {
            // Item is being unequipped - remove attachment effects
            const parentUuidProperty = `${parentType}Uuid`;
            const effectsToRemove = actor.effects.filter(effect => {
                const attachmentSource = effect.getFlag(CONFIG.DH.id, CONFIG.DH.FLAGS.attachmentSource);
                return attachmentSource && attachmentSource[parentUuidProperty] === this.parent.uuid;
            });

            if (effectsToRemove.length > 0) {
                await actor.deleteEmbeddedDocuments('ActiveEffect', effectsToRemove.map(e => e.id));
            }
        }
    }

    /**
     * Copy all effects from an attached item to the actor when the parent item is equipped
     * @param {Item} attachedItem - The item being attached
     * @param {string} attachedUuid - UUID of the attached item
     * @param {string} parentType - Type of parent item ("armor" or "weapon")
     * @param {Actor} actor - The actor to add effects to
     */
    async _copyAttachmentEffectsToActor(attachedItem, attachedUuid, parentType, actor) {
        if (!actor || !attachedItem.effects.size > 0) {
            return [];
        }

        const effectsToCreate = [];
        for (const effect of attachedItem.effects) {
            const effectData = effect.toObject();
            effectData.origin = `${this.parent.uuid}:${attachedUuid}`;
            
            // Set up attachment source metadata with the appropriate property name
            const attachmentSource = {
                itemUuid: attachedUuid,
                originalEffectId: effect.id
            };
            attachmentSource[`${parentType}Uuid`] = this.parent.uuid;
            
            effectData.flags = {
                ...effectData.flags,
                daggerheart: {
                    ...effectData.flags?.daggerheart,
                    [CONFIG.DH.FLAGS.attachmentSource]: attachmentSource
                }
            };
            effectsToCreate.push(effectData);
        }

        if (effectsToCreate.length > 0) {
            return await actor.createEmbeddedDocuments('ActiveEffect', effectsToCreate);
        }
        
        return [];
    }

    /**
     * Remove an attachment from this item and clean up its effects
     * @param {string} attachedUuid - UUID of the attached item being removed
     * @param {string} parentType - Type of parent item ("armor" or "weapon")
     */
    async removeAttachment(attachedUuid, parentType) {
        const currentAttached = this.attached;
        
        // Remove the attachment from the parent item's attached array
        await this.parent.update({
            'system.attached': currentAttached.filter(uuid => uuid !== attachedUuid)
        });
        
        // Remove any effects that came from this attachment
        await this._removeAttachmentEffectsFromActor(attachedUuid, parentType);
    }

    /**
     * Remove effects from the actor that came from a specific attached item
     * @param {string} attachedUuid - UUID of the attached item being removed
     * @param {string} parentType - Type of parent item ("armor" or "weapon")
     */
    async _removeAttachmentEffectsFromActor(attachedUuid, parentType) {
        const actor = this.parent?.type === 'character' ? this.parent : this.parent?.parent;
        if (!actor) return;

        const parentUuidProperty = `${parentType}Uuid`;
        const effectsToRemove = actor.effects.filter(effect => {
            const attachmentSource = effect.getFlag(CONFIG.DH.id, CONFIG.DH.FLAGS.attachmentSource);
            return attachmentSource && 
                   attachmentSource[parentUuidProperty] === this.parent.uuid && 
                   attachmentSource.itemUuid === attachedUuid;
        });

        if (effectsToRemove.length > 0) {
            await actor.deleteEmbeddedDocuments('ActiveEffect', effectsToRemove.map(e => e.id));
        }
    }

    /**
     * Add an attachment to this item
     * @param {Item} droppedItem - The item being attached
     * @param {string} parentType - Type of parent item ("armor" or "weapon")
     */
    async addAttachment(droppedItem, parentType) {
        const currentAttached = this.attached;
        const newUUID = droppedItem.uuid;
        
        if (currentAttached.includes(newUUID)) {
            ui.notifications.warn(`${droppedItem.name} is already attached to this ${parentType}.`);
            return;
        }
        
        const updatedAttached = [...currentAttached, newUUID];
        
        await this.parent.update({
            'system.attached': updatedAttached
        });
        
        // Copy effects from attached item to actor (only if parent item is equipped)
        const actor = this.parent?.type === 'character' ? this.parent : this.parent?.parent;
        if (actor && droppedItem.effects.size > 0 && this.equipped) {
            await this._copyAttachmentEffectsToActor(droppedItem, newUUID, parentType, actor);
        }
    }
}
