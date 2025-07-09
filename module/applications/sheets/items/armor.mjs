import DHBaseItemSheet from '../api/base-item.mjs';

export default class ArmorSheet extends DHBaseItemSheet {
    /**@inheritdoc */
    static DEFAULT_OPTIONS = {
        classes: ['armor'],
        dragDrop: [
            { dragSelector: null, dropSelector: null },
            { dragSelector: null, dropSelector: '.attachments-section' }
        ],
        actions: {
            removeAttachment: ArmorSheet.#removeAttachment
        },
        tagifyConfigs: [
            {
                selector: '.features-input',
                options: () => CONFIG.DH.ITEM.armorFeatures,
                callback: ArmorSheet.#onFeatureSelect
            }
        ]
    };

    /**@override */
    static PARTS = {
        header: { template: 'systems/daggerheart/templates/sheets/items/armor/header.hbs' },
        tabs: { template: 'systems/daggerheart/templates/sheets/global/tabs/tab-navigation.hbs' },
        description: { template: 'systems/daggerheart/templates/sheets/global/tabs/tab-description.hbs' },
        actions: {
            template: 'systems/daggerheart/templates/sheets/global/tabs/tab-actions.hbs',
            scrollable: ['.actions']
        },
        settings: {
            template: 'systems/daggerheart/templates/sheets/items/armor/settings.hbs',
            scrollable: ['.settings']
        },
        attachments: {
            template: 'systems/daggerheart/templates/sheets/items/armor/attachments.hbs',
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
        
        // Only handle Item drops
        if (data.type !== 'Item') return;
        
        // Check if dropped on attachments section
        const attachmentsSection = event.target.closest('.attachments-section');
        if (!attachmentsSection) return super._onDrop(event);
        
        // Get the item being dropped
        const item = await Item.implementation.fromDropData(data);
        if (!item) return;
        
        // Get current attached UUIDs
        const currentAttached = this.document.system.attached || [];
        const newUUID = item.uuid;
        
        // Prevent duplicates
        if (currentAttached.includes(newUUID)) return;
        
        await this.document.update({
            'system.attached': [...currentAttached, newUUID]
        });
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
    }
}
