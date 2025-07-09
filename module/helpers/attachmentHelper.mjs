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
 * Remove an attachment from an item and clean up its effects
 * @param {Object} options - Configuration options
 * @param {Item} options.parentItem - The item (armor/weapon) that the item is attached to
 * @param {string} options.attachedUuid - UUID of the attached item being removed
 * @param {string} options.parentType - Type of parent item ("armor" or "weapon")
 * @returns {Promise<void>}
 */
export async function removeAttachmentFromItem({ parentItem, attachedUuid, parentType }) {
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

/**
 * Handle adding/removing attachment effects when a parent item is equipped/unequipped
 * @param {Object} options - Configuration options
 * @param {Item} options.parentItem - The item (armor/weapon) being equipped/unequipped
 * @param {boolean} options.newEquippedStatus - The new equipped status
 * @param {string} options.parentType - Type of parent item ("armor" or "weapon")
 * @returns {Promise<void>}
 */
export async function handleAttachmentEffectsOnEquipChange({ parentItem, newEquippedStatus, parentType }) {
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
                await copyAttachmentEffectsToActor({
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
            const attachmentSource = effect.flags?.daggerheart?.attachmentSource;
            return attachmentSource && attachmentSource[parentUuidProperty] === parentItem.uuid;
        });

        if (effectsToRemove.length > 0) {
            await actor.deleteEmbeddedDocuments('ActiveEffect', effectsToRemove.map(e => e.id));
        }
    }
}

/**
 * Prepare attachment context data for rendering
 * @param {Item} parentItem - The item (armor/weapon) that has attachments
 * @returns {Promise<Object[]>} Array of attachment data objects
 */
export async function prepareAttachmentContext(parentItem) {
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

/**
 * Add an attachment to an item via drag and drop
 * @param {Object} options - Configuration options
 * @param {Item} options.parentItem - The item (armor/weapon) that the item is being attached to
 * @param {Item} options.droppedItem - The item being attached
 * @param {string} options.parentType - Type of parent item ("armor" or "weapon")
 * @returns {Promise<void>}
 */
export async function addAttachmentToItem({ parentItem, droppedItem, parentType }) {
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


