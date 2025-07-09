import BaseDataItem from './base.mjs';
import ActionField from '../fields/actionField.mjs';
import { armorFeatures } from '../../config/itemConfig.mjs';
import { actionsTypes } from '../action/_module.mjs';

export default class DHArmor extends BaseDataItem {
    /** @inheritDoc */
    static get metadata() {
        return foundry.utils.mergeObject(super.metadata, {
            label: 'TYPES.Item.armor',
            type: 'armor',
            hasDescription: true,
            isQuantifiable: true,
            isInventoryItem: true
        });
    }

    /** @inheritDoc */
    static defineSchema() {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),
            tier: new fields.NumberField({ required: true, integer: true, initial: 1, min: 1 }),
            equipped: new fields.BooleanField({ initial: false }),
            baseScore: new fields.NumberField({ integer: true, initial: 0 }),
            features: new fields.ArrayField(
                new fields.SchemaField({
                    value: new fields.StringField({
                        required: true,
                        choices: CONFIG.DH.ITEM.armorFeatures,
                        blank: true
                    }),
                    effectIds: new fields.ArrayField(new fields.StringField({ required: true })),
                    actionIds: new fields.ArrayField(new fields.StringField({ required: true }))
                })
            ),
            marks: new fields.SchemaField({
                value: new fields.NumberField({ initial: 0, integer: true })
            }),
            baseThresholds: new fields.SchemaField({
                major: new fields.NumberField({ integer: true, initial: 0 }),
                severe: new fields.NumberField({ integer: true, initial: 0 })
            }),
            attached: new fields.ArrayField(new fields.DocumentUUIDField({ type: "Item", nullable: true })),
            actions: new fields.ArrayField(new ActionField())
        };
    }

    get featureInfo() {
        return this.feature ? CONFIG.DH.ITEM.armorFeatures[this.feature] : null;
    }

    async _preUpdate(changes, options, user) {
        const allowed = await super._preUpdate(changes, options, user);
        if (allowed === false) return false;

        // Handle equipped status changes for attachment effects
        if (changes.system?.equipped !== undefined && changes.system.equipped !== this.equipped) {
            await this._handleAttachmentEffectsOnEquipChange(changes.system.equipped);
        }

        if (changes.system.features) {
            const removed = this.features.filter(x => !changes.system.features.includes(x));
            const added = changes.system.features.filter(x => !this.features.includes(x));

            for (var feature of removed) {
                for (var effectId of feature.effectIds) {
                    await this.parent.effects.get(effectId).delete();
                }

                changes.system.actions = this.actions.filter(x => !feature.actionIds.includes(x._id));
            }

            for (var feature of added) {
                const featureData = armorFeatures[feature.value];
                if (featureData.effects?.length > 0) {
                    const embeddedItems = await this.parent.createEmbeddedDocuments('ActiveEffect', [
                        {
                            name: game.i18n.localize(featureData.label),
                            description: game.i18n.localize(featureData.description),
                            changes: featureData.effects.flatMap(x => x.changes)
                        }
                    ]);
                    feature.effectIds = embeddedItems.map(x => x.id);
                }
                if (featureData.actions?.length > 0) {
                    const newActions = featureData.actions.map(action => {
                        const cls = actionsTypes[action.type];
                        return new cls(
                            { ...action, _id: foundry.utils.randomID(), name: game.i18n.localize(action.name) },
                            { parent: this }
                        );
                    });
                    changes.system.actions = [...this.actions, ...newActions];
                    feature.actionIds = newActions.map(x => x._id);
                }
            }
        }
    }

    /**
     * Handle adding/removing attachment effects when armor is equipped/unequipped
     * @param {boolean} newEquippedStatus - The new equipped status
     */
    async _handleAttachmentEffectsOnEquipChange(newEquippedStatus) {
        const actor = this.parent.parent;
        if (!actor || !this.attached?.length) return;

        if (newEquippedStatus) {
            // Armor is being equipped - add attachment effects
            console.log(`Armor ${this.parent.name} being equipped, adding attachment effects`);
            
            const effectsToCreate = [];
            for (const attachedUuid of this.attached) {
                const attachedItem = await fromUuid(attachedUuid);
                if (attachedItem && attachedItem.effects.size > 0) {
                    for (const effect of attachedItem.effects) {
                        const effectData = effect.toObject();
                        effectData.origin = `${this.parent.uuid}:${attachedUuid}`;
                        effectData.flags = {
                            ...effectData.flags,
                            daggerheart: {
                                ...effectData.flags?.daggerheart,
                                attachmentSource: {
                                    armorUuid: this.parent.uuid,
                                    itemUuid: attachedUuid,
                                    originalEffectId: effect.id
                                }
                            }
                        };
                        effectsToCreate.push(effectData);
                    }
                }
            }
            
            if (effectsToCreate.length > 0) {
                await actor.createEmbeddedDocuments('ActiveEffect', effectsToCreate);
                console.log(`Created ${effectsToCreate.length} attachment effects on actor`);
            }
        } else {
            // Armor is being unequipped - remove attachment effects
            console.log(`Armor ${this.parent.name} being unequipped, removing attachment effects`);
            
            const effectsToRemove = actor.effects.filter(effect => {
                const attachmentSource = effect.flags?.daggerheart?.attachmentSource;
                return attachmentSource && attachmentSource.armorUuid === this.parent.uuid;
            });
            
            if (effectsToRemove.length > 0) {
                await actor.deleteEmbeddedDocuments('ActiveEffect', effectsToRemove.map(e => e.id));
                console.log(`Removed ${effectsToRemove.length} attachment effects from actor`);
            }
        }
    }
}
