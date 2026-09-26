import en from './i18n/en.json';
import de from './i18n/de.json';

const translations = {
    en,
    de,
    // vis-2 selects the dictionary by the editor language and does not fall
    // back to English when that dictionary is absent. Keep the supported
    // locale entries while maintaining translations in English and German only.
    ru: en,
    pt: en,
    nl: en,
    fr: en,
    it: en,
    es: en,
    pl: en,
    uk: en,
    'zh-cn': en,
    prefix: 'vis_2_widgets_nils_',
};

export default translations;
