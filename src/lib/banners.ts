// Banner / logo slots (one image each). `images.alt` = "<slot>|<description>".
export const SLOTS: string[] = ['logo', 'hero', 'hero_mobile', 'offer', 'about', 'collection_1', 'collection_2', 'collection_3', 'collection_4'];
export const slotOk = (s: unknown): s is string => typeof s === 'string' && SLOTS.includes(s);
