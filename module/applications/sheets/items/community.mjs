import DHHeritageSheet from '../api/heritage-sheet.mjs';

export default class CommunitySheet extends DHHeritageSheet {
    /**@inheritdoc */
    static DEFAULT_OPTIONS = {
        classes: ['community'],
        window: { resizable: true }
    };

    /**@inheritdoc */
    static PARTS = {
        header: { template: 'systems/daggerheart/templates/sheets/items/community/header.hbs' },
        ...super.PARTS
    };
}
