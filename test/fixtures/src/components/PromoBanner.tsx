import { Field, ImageField, LinkField, RichTextField } from "@sitecore-jss/sitecore-jss-nextjs";

/**
 * Promo banner. Same shape as PromoSplit under a different name.
 * @placeholder main
 */
export type PromoBannerFields = {
  Eyebrow?: Field<string>;
  Heading: Field<string>;
  Body: RichTextField;
  Image: ImageField;
  PrimaryCta: LinkField;
  SecondaryCta?: LinkField;
};

export default function PromoBanner() {
  return null;
}
