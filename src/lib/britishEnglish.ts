/** British spellings for portal-authored display text. Never apply to source titles, names, identifiers or raw data. */
const spellings: Record<string, string> = {
  color: 'colour', colors: 'colours', colored: 'coloured', coloring: 'colouring', colormap: 'colour map', colormaps: 'colour maps',
  center: 'centre', centers: 'centres', centered: 'centred', centering: 'centring', multicenter: 'multicentre',
  edema: 'oedema', papilledema: 'papilloedema', anemia: 'anaemia', tumor: 'tumour', tumors: 'tumours',
  hemorrhage: 'haemorrhage', hemorrhages: 'haemorrhages', hemorrhagic: 'haemorrhagic', fetal: 'foetal', pediatric: 'paediatric',
  behavior: 'behaviour', behaviors: 'behaviours', behavioral: 'behavioural', modeling: 'modelling', modeled: 'modelled', modeler: 'modeller', modelers: 'modellers',
  labeling: 'labelling', labeled: 'labelled', unlabeled: 'unlabelled', leveling: 'levelling', leveled: 'levelled',
  favor: 'favour', favors: 'favours', favored: 'favoured', favoring: 'favouring', favorable: 'favourable', favorably: 'favourably',
  analyze: 'analyse', analyzes: 'analyses', analyzed: 'analysed', analyzing: 'analysing',
  artifact: 'artefact', artifacts: 'artefacts', defense: 'defence', defenses: 'defences', enrollment: 'enrolment', enrollments: 'enrolments',
  gray: 'grey', grayish: 'greyish', grayscale: 'greyscale', aging: 'ageing', judgment: 'judgement', judgments: 'judgements'
};
const roots = ['categor', 'character', 'custom', 'disorgan', 'emphas', 'general', 'harmon', 'homogen', 'individual', 'local', 'neovascular', 'normal', 'operational', 'optim', 'organ', 'parameter', 'personal', 'priorit', 'quant', 'random', 'recogn', 'regular', 'stabil', 'standard', 'summar', 'superpixel', 'synthes', 'token', 'visual'];
for (const root of roots) {
  for (const suffix of ['ize', 'izes', 'ized', 'izing', 'izer', 'izers', 'ization', 'izations']) {
    spellings[root + suffix] = root + suffix.replace('iz', 'is');
  }
}
// Exact, reviewed punctuation correction for a portal-authored evidence summary.
const editorialPhrases: Record<string, string> = {
  'an end-to-end, adaptive and explainable deep-learning approach': 'an end-to-end, adaptive, and explainable deep-learning approach'
};
const words = new RegExp(`\\b(${Object.keys(spellings).join('|')})\\b`, 'gi');
// Quoted wording, code, URLs and DOI strings retain their original spelling.
const preserved = /(`[^`]*`|“[^”]*”|‘[^’]*’|"[^"\n]*"|(?<!\w)'[^'\n]+'(?!\w)|https?:\/\/\S+|\b10\.\d{4,9}\/\S+)/g;
export function britishText(value: string): string {
  return value.split(preserved).map((part, index) => {
    if (index % 2) return part;
    for (const [source, replacement] of Object.entries(editorialPhrases)) part = part.replaceAll(source, replacement);
    return part.replace(words, (word) => {
      const replacement = spellings[word.toLowerCase()] ?? word;
      if (word === word.toUpperCase()) return replacement.toUpperCase();
      return /^[A-Z]/.test(word) ? replacement.charAt(0).toUpperCase() + replacement.slice(1) : replacement;
    });
  }).join('');
}
