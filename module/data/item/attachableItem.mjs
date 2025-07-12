import BaseDataItem from './base.mjs';

export default class AttachableItem extends BaseDataItem {
    static defineSchema() {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),
            attached: new fields.ArrayField(new fields.DocumentUUIDField({ type: "Item", nullable: true }))
        };
    }
    
    async copyAttachmentEffectsToActor({ parentItem, attachedItem, attachedUuid, parentType }) {
        const actor = parentItem.parent;
        if (!actor || !attachedItem.effects.size > 0 || !parentItem.system.equipped) {
            return [];
        }

        const effectsToCreate = [];
        for (const effect of attachedItem.effects) {
            // Copy ALL effects when item is attached - attachment-only flag only matters for non-attached items
            const effectData = effect.toObject();
            effectData.origin = `${parentItem.uuid}:${attachedUuid}`;
            
            // Set up attachment source metadata with the appropriate property name
            const attachmentSource = {
                itemUuid: attachedUuid,
                originalEffectId: effect.id
            };
            attachmentSource[`${parentType}Uuid`] = parentItem.uuid;
            
            effectData.flags = {
                ...effectData.flags,
                [CONFIG.DH.id]: {
                    ...effectData.flags?.[CONFIG.DH.id],
                    [CONFIG.DH.FLAGS.itemAttachmentSource]: attachmentSource
                }
            };
            effectsToCreate.push(effectData);
        }

        if (effectsToCreate.length > 0) {
            return await actor.createEmbeddedDocuments('ActiveEffect', effectsToCreate);
        }
        
        return [];
    }

    async handleAttachmentEffectsOnEquipChange({ parentItem, newEquippedStatus, parentType }) {
    // Try to get the actor - it might be parentItem.parent instead of parentItem.parent.parent
    const actor = parentItem.parent?.type === 'character' ? parentItem.parent : parentItem.parent?.parent;
    
        if (!actor || !parentItem.system.attached?.length) {
            return;
        }

        if (newEquippedStatus) {
            // Item is being equipped - add attachment effects
            for (const attachedUuid of parentItem.system.attached) {
                const attachedItem = await fromUuid(attachedUuid);
                if (attachedItem && attachedItem.effects.size > 0) {
                    this.copyAttachmentEffectsToActor({
                        parentItem,
                        attachedItem,
                        attachedUuid,
                        parentType
                    });
                }
            }
        } else {
            // Item is being unequipped - remove attachment effects
            const parentUuidProperty = `${parentType}Uuid`;
            const effectsToRemove = actor.effects.filter(effect => {
                const attachmentSource = effect.getFlag(CONFIG.DH.id, CONFIG.DH.FLAGS.itemAttachmentSource);
                return attachmentSource && attachmentSource[parentUuidProperty] === parentItem.uuid;
            });

            if (effectsToRemove.length > 0) {
                await actor.deleteEmbeddedDocuments('ActiveEffect', effectsToRemove.map(e => e.id));
            }
        }
    }

    async _preUpdate(changes, options, user) {
        const allowed = await super._preUpdate(changes, options, user);
        if (allowed === false) return false;

        // Handle equipped status changes for attachment effects
        if (changes.system?.equipped !== undefined && changes.system.equipped !== this.equipped) {
            await this.handleAttachmentEffectsOnEquipChange({
                parentItem: this.parent,
                newEquippedStatus: changes.system.equipped,
                parentType: this.parent.type
            });
        }
    }
}