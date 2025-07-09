/**
 * Utility functions for handling item attachments and their effects
 */

/**
 * Copy all effects from an attached item to the actor when the parent item is equipped
 * @param {Object} options - Configuration options
 * @param {Item} options.parentItem - The item (armor/weapon) that the item is being attached to
 * @param {Item} options.attachedItem - The item being attached
 * @param {string} options.attachedUuid - UUID of the attached item
 * @param {string} options.parentType - Type of parent item ("armor" or "weapon")
 * @returns {Promise<ActiveEffect[]>} Created effects
 */
export async function copyAttachmentEffectsToActor({ parentItem, attachedItem, attachedUuid, parentType }) {
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
            daggerheart: {
                ...effectData.flags?.daggerheart,
                attachmentSource
            }
        };
        effectsToCreate.push(effectData);
    }

    if (effectsToCreate.length > 0) {
        return await actor.createEmbeddedDocuments('ActiveEffect', effectsToCreate);
    }
    
    return [];
}

/**
 * Remove effects from the actor that came from a specific attached item
 * @param {Object} options - Configuration options
 * @param {Item} options.parentItem - The item (armor/weapon) that the item was attached to
 * @param {string} options.attachedUuid - UUID of the attached item being removed
 * @param {string} options.parentType - Type of parent item ("armor" or "weapon")
 * @returns {Promise<void>}
 */
export async function removeAttachmentEffectsFromActor({ parentItem, attachedUuid, parentType }) {
    const actor = parentItem.parent;
    if (!actor) return;

    const parentUuidProperty = `${parentType}Uuid`;
    const effectsToRemove = actor.effects.filter(effect => {
        const attachmentSource = effect.flags?.daggerheart?.attachmentSource;
        return attachmentSource && 
               attachmentSource[parentUuidProperty] === parentItem.uuid && 
               attachmentSource.itemUuid === attachedUuid;
    });

    if (effectsToRemove.length > 0) {
        await actor.deleteEmbeddedDocuments('ActiveEffect', effectsToRemove.map(e => e.id));
    }
}

/**
 * Handle adding/removing attachment effects when a parent item is equipped/unequipped
 * @param {Object} options - Configuration options
 * @param {Item} options.parentItem - The item (armor/weapon) being equipped/unequipped
 * @param {boolean} options.newEquippedStatus - The new equipped status
 * @param {string} options.parentType - Type of parent item ("armor" or "weapon")
 * @returns {Promise<void>}
 */
export async function handleAttachmentEffectsOnEquipChange({ parentItem, newEquippedStatus, parentType }) {
    const actor = parentItem.parent?.parent;
    if (!actor || !parentItem.system.attached?.length) return;

    if (newEquippedStatus) {
        // Item is being equipped - add attachment effects
        const effectsToCreate = [];
        for (const attachedUuid of parentItem.system.attached) {
            const attachedItem = await fromUuid(attachedUuid);
            if (attachedItem && attachedItem.effects.size > 0) {
                const newEffects = await copyAttachmentEffectsToActor({
                    parentItem,
                    attachedItem,
                    attachedUuid,
                    parentType
                });
                effectsToCreate.push(...newEffects);
            }
        }
    } else {
        // Item is being unequipped - remove attachment effects
        const parentUuidProperty = `${parentType}Uuid`;
        const effectsToRemove = actor.effects.filter(effect => {
            const attachmentSource = effect.flags?.daggerheart?.attachmentSource;
            return attachmentSource && attachmentSource[parentUuidProperty] === parentItem.uuid;
        });

        if (effectsToRemove.length > 0) {
            await actor.deleteEmbeddedDocuments('ActiveEffect', effectsToRemove.map(e => e.id));
        }
    }
}
