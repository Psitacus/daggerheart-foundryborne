import { 
    removeAttachmentFromItem, 
    prepareAttachmentContext, 
    addAttachmentToItem 
} from '../../../helpers/attachmentHelper.mjs';

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
    };
}