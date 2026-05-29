export type OgKind = 't' | 'g' | 'c';

export type OgPreview = {
  kind: OgKind;
  title: string;
  description: string;
  eyebrow: string;
  hero: string;
  routeLabel: string;
  badge: string;
  url: string;
  imageUrl: string;
};
