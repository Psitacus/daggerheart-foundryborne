import DHBaseItemSheet from '../api/base-item.mjs';
import { copyAttachmentEffectsToActor, removeAttachmentEffectsFromActor } from '../../../helpers/attachmentHelper.mjs';

export default class WeaponSheet extends DHBaseItemSheet {
    /**@inheritdoc */
    static DEFAULT_OPTIONS = {
        classes: ['weapon'],
        dragDrop: [
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
                const attachedUUIDs = this.document.system.attached || [];
                context.attachedItems = await Promise.all(
                    attachedUUIDs.map(async uuid => {
                        const item = await fromUuid(uuid);
                        return {
                            uuid: uuid,
                            name: item?.name || 'Unknown Item',
                            img: item?.img || 'icons/svg/item-bag.svg'
                        };
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
        
        const attachmentsSection = event.target.closest('.attachments-section');
        if (!attachmentsSection) return super._onDrop(event);
        
        event.preventDefault();
        event.stopPropagation();
        
        const item = await Item.implementation.fromDropData(data);
        if (!item) return;
        
        const currentAttached = this.document.system.attached || [];
        const newUUID = item.uuid;
        
        if (currentAttached.includes(newUUID)) {
            ui.notifications.warn(`${item.name} is already attached to this weapon.`);
            return;
        }
        
        const updatedAttached = [...currentAttached, newUUID];
        
        await this.document.update({
            'system.attached': updatedAttached
        });
        
        // Copy ALL effects from attached item to actor (only if weapon is equipped)
        // Both attachment-only and regular effects should be copied when attached
        const actor = this.document.parent;
        if (actor && item.effects.size > 0 && this.document.system.equipped) {
            await copyAttachmentEffectsToActor({
                parentItem: this.document,
                attachedItem: item,
                attachedUuid: newUUID,
                parentType: 'weapon'
            });
        }
    }

    /**
     * Remove an attached item
     * @param {Event} event - The click event
     * @param {HTMLElement} target - The clicked element
     */
    static async #removeAttachment(event, target) {
        const uuid = target.dataset.uuid;
        const currentAttached = this.document.system.attached || [];
        
        await this.document.update({
            'system.attached': currentAttached.filter(attachedUuid => attachedUuid !== uuid)
        });
        
        await removeAttachmentEffectsFromActor({
            parentItem: this.document,
            attachedUuid: uuid,
            parentType: 'weapon'
        });
    }
}
