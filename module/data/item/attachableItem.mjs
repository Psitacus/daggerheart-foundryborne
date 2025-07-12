import BaseDataItem from './base.mjs';

export default class AttachableItem extends BaseDataItem {
    static defineSchema() {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),
            attached: new fields.ArrayField(new fields.DocumentUUIDField({ type: "Item", nullable: true }))
        };
    }
}