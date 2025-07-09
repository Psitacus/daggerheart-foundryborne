import DHBaseItemSheet from '../api/base-item.mjs';

export default class WeaponSheet extends DHBaseItemSheet {
    /**@inheritdoc */
    static DEFAULT_OPTIONS = {
        classes: ['weapon'],
        dragDrop: [
            { dragSelector: null, dropSelector: null },
            { dragSelector: null, dropSelector: '.attachments-section' }
        ],
        actions: {
            removeAttachment: WeaponSheet.#removeAttachment
        },
        tagifyConfigs: [
            {
                selector: '.features-input',
                options: () => CONFIG.DH.ITEM.weaponFeatures,
                callback: WeaponSheet.#onFeatureSelect
            }
        ]
    };

    /**@override */
    static PARTS = {
        header: { template: 'systems/daggerheart/templates/sheets/items/weapon/header.hbs' },
        tabs: { template: 'systems/daggerheart/templates/sheets/global/tabs/tab-navigation.hbs' },
        description: { template: 'systems/daggerheart/templates/sheets/global/tabs/tab-description.hbs' },
        actions: {
            template: 'systems/daggerheart/templates/sheets/global/tabs/tab-actions.hbs',
            scrollable: ['.actions']
        },
        settings: {
            template: 'systems/daggerheart/templates/sheets/items/weapon/settings.hbs',
            scrollable: ['.settings']
        },
        attachments: {
            template: 'systems/daggerheart/templates/sheets/items/weapon/attachments.hbs',
            scrollable: ['.attachments']
        }
    };

    /** @override */
    static TABS = {
        primary: {
            tabs: [{ id: 'description' }, { id: 'actions' }, { id: 'settings' }, { id: 'attachments' }],
            initial: 'description',
            labelPrefix: 'DAGGERHEART.GENERAL.Tabs'
        }
    };

    /**@inheritdoc */
    async _preparePartContext(partId, context) {
        await super._preparePartContext(partId, context);
        switch (partId) {
            case 'settings':
                context.features = this.document.system.features.map(x => x.value);
                context.systemFields.attack.fields = this.document.system.attack.schema.fields;
                break;
            case 'attachments':
                // Prepare attached items for display
                const attachedUUIDs = this.document.system.attached || [];
                context.attachedItems = await Promise.all(
                    attachedUUIDs.map(async uuid => {
                        try {
                            const item = await fromUuid(uuid);
                            return {
                                uuid: uuid,
                                name: item?.name || 'Unknown Item',
                                img: item?.img || 'icons/svg/item-bag.svg'
                            };
                        } catch (error) {
                            return {
                                uuid: uuid,
                                name: 'Unknown Item',
                                img: 'icons/svg/item-bag.svg'
                            };
                        }
                    })
                );
                break;
        }
        return context;
    }

    /**
     * Callback function used by `tagifyElement`.
     * @param {Array<Object>} selectedOptions - The currently selected tag objects.
     */
    static async #onFeatureSelect(selectedOptions) {
        await this.document.update({ 'system.features': selectedOptions.map(x => ({ value: x.value })) });
    }

    /**
     * Handle dropping items onto the attachments section
     * @param {DragEvent} event - The drop event
     */
    async _onDrop(event) {
        const data = TextEditor.getDragEventData(event);
        
        // Check if dropped on attachments section
        const attachmentsSection = event.target.closest('.attachments-section');
        if (!attachmentsSection) return super._onDrop(event);
        
        // Prevent event bubbling
        event.preventDefault();
        event.stopPropagation();
        
        // Get the item being dropped
        const item = await Item.implementation.fromDropData(data);
        if (!item) return;
        
        console.log(`Dropping item ${item.name} (${item.uuid}) onto weapon ${this.document.name}`);
        
        // Get current attached UUIDs
        const currentAttached = this.document.system.attached || [];
        const newUUID = item.uuid;
        
        // Don't attach if already attached
        if (currentAttached.includes(newUUID)) {
            ui.notifications.warn(`${item.name} is already attached to this weapon.`);
            return;
        }
        
        console.log(`Current attached items:`, currentAttached);
        console.log(`Adding new UUID:`, newUUID);
        
        const updatedAttached = [...currentAttached, newUUID];
        console.log(`Updating weapon with attached items:`, updatedAttached);
        
        await this.document.update({
            'system.attached': updatedAttached
        });
        
        // Copy ALL effects from attached item to actor (only if weapon is equipped)
        // Both attachment-only and regular effects should be copied when attached
        const actor = this.document.parent;
        if (actor && item.effects.size > 0 && this.document.system.equipped) {
            console.log(`Checking ${item.effects.size} effects from attached item ${item.name}`);
            
            const effectsToCreate = [];
            for (const effect of item.effects) {
                // Copy ALL effects when item is attached - attachment-only flag only matters for non-attached items
                const effectData = effect.toObject();
                effectData.origin = `${this.document.uuid}:${newUUID}`; // Track which weapon and which item this came from
                effectData.flags = {
                    ...effectData.flags,
                    daggerheart: {
                        ...effectData.flags?.daggerheart,
                        attachmentSource: {
                            weaponUuid: this.document.uuid,
                            itemUuid: newUUID,
                            originalEffectId: effect.id
                        }
                    }
                };
                effectsToCreate.push(effectData);
                
                const isAttachmentOnly = effect.flags?.daggerheart?.attachmentOnly === true;
                console.log(`Effect ${effect.name} (attachment-only: ${isAttachmentOnly}) will be copied to actor`);
            }
            
            if (effectsToCreate.length > 0) {
                const createdEffects = await actor.createEmbeddedDocuments('ActiveEffect', effectsToCreate);
                console.log(`Created ${createdEffects.length} effects on actor from attached item`);
            } else {
                console.log(`No effects found on ${item.name}, no effects copied to actor`);
            }
        } else if (item.effects.size > 0 && !this.document.system.equipped) {
            console.log(`Weapon ${this.document.name} is not equipped, attachment effects will be applied when equipped`);
        }
        
        console.log(`Weapon updated successfully`);
    }

    /**
     * Remove an attached item
     * @param {Event} event - The click event
     * @param {HTMLElement} target - The clicked element
     */
    static async #removeAttachment(event, target) {
        const uuid = target.dataset.uuid;
        const currentAttached = this.document.system.attached || [];
        
        // Remove the attachment from the weapon
        await this.document.update({
            'system.attached': currentAttached.filter(attachedUuid => attachedUuid !== uuid)
        });
        
        // Remove any effects on the actor that came from this attached item
        const actor = this.document.parent;
        if (actor) {
            const effectsToRemove = actor.effects.filter(effect => {
                const attachmentSource = effect.flags?.daggerheart?.attachmentSource;
                return attachmentSource && 
                       attachmentSource.weaponUuid === this.document.uuid && 
                       attachmentSource.itemUuid === uuid;
            });
            
            if (effectsToRemove.length > 0) {
                console.log(`Removing ${effectsToRemove.length} effects from actor that came from detached item ${uuid}`);
                await actor.deleteEmbeddedDocuments('ActiveEffect', effectsToRemove.map(e => e.id));
            }
        }
    }
}
