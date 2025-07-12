
export default function ItemAttachmentSheet(Base) {
    return class extends Base {
        static DEFAULT_OPTIONS = {
            ...super.DEFAULT_OPTIONS,
            dragDrop: [
                ...(super.DEFAULT_OPTIONS.dragDrop || []),
                { dragSelector: null, dropSelector: '.attachments-section' }
            ],
            actions: {
                ...super.DEFAULT_OPTIONS.actions,
                removeAttachment: this.#removeAttachment
            }
        };

        static PARTS = {
            ...super.PARTS,
            attachments: {
                template: 'systems/daggerheart/templates/sheets/global/tabs/tab-attachments.hbs',
                scrollable: ['.attachments']
            }
        };

        async _preparePartContext(partId, context) {
            await super._preparePartContext(partId, context);

            if (partId === 'attachments') {
                context.attachedItems = await prepareAttachmentContext(this.document);
            }

            return context;
        }

        async _onDrop(event) {
            const data = TextEditor.getDragEventData(event);
            
            const attachmentsSection = event.target.closest('.attachments-section');
            if (!attachmentsSection) return super._onDrop(event);
            
            event.preventDefault();
            event.stopPropagation();
            
            const item = await Item.implementation.fromDropData(data);
            if (!item) return;
            
            await addAttachmentToItem({
                parentItem: this.document,
                droppedItem: item,
                parentType: this.document.type
            });
        }

        static async #removeAttachment(event, target) {
            await removeAttachmentFromItem({
                parentItem: this.document,
                attachedUuid: target.dataset.uuid,
                parentType: this.document.type
            });
        }

        async removeAttachmentEffectsFromActor({ parentItem, attachedUuid, parentType }) {
            const actor = parentItem.parent;
            if (!actor) return;

            const parentUuidProperty = `${parentType}Uuid`;
            const effectsToRemove = actor.effects.filter(effect => {
                const attachmentSource = effect.getFlag(CONFIG.DH.id, CONFIG.DH.FLAGS.itemAttachmentSource);
                return attachmentSource && 
                    attachmentSource[parentUuidProperty] === parentItem.uuid && 
                    attachmentSource.itemUuid === attachedUuid;
            });

            if (effectsToRemove.length > 0) {
                await actor.deleteEmbeddedDocuments('ActiveEffect', effectsToRemove.map(e => e.id));
            }
        }

        async removeAttachmentFromItem({ parentItem, attachedUuid, parentType }) {
            const currentAttached = parentItem.system.attached;
            
            // Remove the attachment from the parent item's attached array
            await parentItem.update({
                'system.attached': currentAttached.filter(uuid => uuid !== attachedUuid)
            });
            
            // Remove any effects that came from this attachment
            await removeAttachmentEffectsFromActor({
                parentItem,
                attachedUuid,
                parentType
            });
        }
        async prepareAttachmentContext(parentItem) {
            const attachedUUIDs = parentItem.system.attached;
            return await Promise.all(
                attachedUUIDs.map(async uuid => {
                    const item = await fromUuid(uuid);
                    return {
                        uuid: uuid,
                        name: item?.name || 'Unknown Item',
                        img: item?.img || 'icons/svg/item-bag.svg'
                    };
                })
            );
        }

       async addAttachmentToItem({ parentItem, droppedItem, parentType }) {
            const currentAttached = parentItem.system.attached;
            const newUUID = droppedItem.uuid;
            
            if (currentAttached.includes(newUUID)) {
                ui.notifications.warn(`${droppedItem.name} is already attached to this ${parentType}.`);
                return;
            }
            
            const updatedAttached = [...currentAttached, newUUID];
            
            await parentItem.update({
                'system.attached': updatedAttached
            });
            
            // Copy effects from attached item to actor (only if parent item is equipped)
            const actor = parentItem.parent;
            if (actor && droppedItem.effects.size > 0 && parentItem.system.equipped) {
                await copyAttachmentEffectsToActor({
                    parentItem,
                    attachedItem: droppedItem,
                    attachedUuid: newUUID,
                    parentType
                });
            }
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
    };
}