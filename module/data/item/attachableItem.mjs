import BaseDataItem from './base.mjs';
import { handleAttachmentEffectsOnEquipChange } from '../../helpers/attachmentHelper.mjs';

export default class AttachableItem extends BaseDataItem {
    static defineSchema() {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),
            attached: new fields.ArrayField(new fields.DocumentUUIDField({ type: "Item", nullable: true }))
        };
    }

    async _preUpdate(changes, options, user) {
        const allowed = await super._preUpdate(changes, options, user);
        if (allowed === false) return false;

        // Handle equipped status changes for attachment effects
        if (changes.system?.equipped !== undefined && changes.system.equipped !== this.equipped) {
            await handleAttachmentEffectsOnEquipChange({
                parentItem: this.parent,
                newEquippedStatus: changes.system.equipped,
                parentType: this.parent.type
            });
        }
    }
}