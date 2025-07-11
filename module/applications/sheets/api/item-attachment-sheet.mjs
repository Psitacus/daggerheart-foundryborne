/**
 * Mixin for item sheets that support attachments (armor, weapons, etc.)
 * @param {class} Base - The base class to extend
 * @returns {class} - The extended class with attachment functionality
 */
export default function ItemAttachmentSheetMixin(Base) {
    return class ItemAttachmentSheet extends Base {
        
        /** @inheritDoc */
        static DEFAULT_OPTIONS = {
            ...super.DEFAULT_OPTIONS,
            dragDrop: [
                ...super.DEFAULT_OPTIONS?.dragDrop || [],
                { dropSelector: '.drop-section' }
            ],
            actions: {
                ...super.DEFAULT_OPTIONS?.actions || {},
                removeAttachment: this._onRemoveAttachment
            }
        };

        /** @inheritDoc */
        static PARTS = {
            ...super.PARTS,
            attachments: { 
                template: 'systems/daggerheart/templates/sheets/global/tabs/tab-attachments.hbs' 
            }
        };

        /**
         * Prepare attachment context for rendering
         */
        async _preparePartContext(partId, context) {
            const partContext = await super._preparePartContext(partId, context);
            
            if (partId === 'attachments') {
                partContext.attachedItems = await this._prepareAttachmentContext();
            }
            
            return partContext;
        }

        /**
         * Prepare attachment context data for rendering
         * @returns {Promise<Object[]>} Array of attachment data objects
         */
        async _prepareAttachmentContext() {
            const attachedUUIDs = this.document.system.attached;
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

        /**
         * Handle drag start events
         */
        async _onDragStart(event) {
            await super._onDragStart?.(event);
            
            const target = event.currentTarget;
            const uuid = target.dataset.uuid;
            
            if (uuid) {
                const item = await fromUuid(uuid);
                if (item) {
                    event.dataTransfer.setData('text/plain', JSON.stringify({
                        type: 'Item',
                        uuid: uuid
                    }));
                }
            }
        }

        /**
         * Handle drop events for attachments
         */
        async _onDrop(event) {
            if (await super._onDrop?.(event) === false) return false;
            
            const data = TextEditor.getDragEventData(event);
            
            if (data.type === 'Item') {
                const droppedItem = await fromUuid(data.uuid);
                const parentType = this.document.type;
                
                if (droppedItem && ['armor', 'weapon'].includes(parentType)) {
                    // Check if dropped on attachment area
                    const dropSection = event.target.closest('.drop-section');
                    if (dropSection?.classList.contains('attachments-section')) {
                        await this.document.system.addAttachment(droppedItem, parentType);
                        this.render();
                        return false;
                    }
                }
            }
            
            return true;
        }

        /**
         * Handle removing attachments
         */
        static async _onRemoveAttachment(event, target) {
            const uuid = target.dataset.uuid;
            const parentType = this.document.type;
            
            if (uuid && ['armor', 'weapon'].includes(parentType)) {
                await this.document.system.removeAttachment(uuid, parentType);
                this.render();
            }
        }
    };
}
