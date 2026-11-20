import {
  Field,
  ImageField,
  LinkField,
  RichTextField,
  withDatasourceCheck,
} from "@sitecore-jss/sitecore-jss-nextjs";
import type { ComponentProps } from "lib/component-props";

/**
 * Two-column promotional block: image on one side, copy on the other.
 * Use for campaign landing pages and mid-page conversion moments.
 *
 * @placeholder main
 * @placeholder promo-zone
 * @maxPerPage 3
 * @param variant image-left | image-right | stacked
 */
export type PromoSplitFields = {
  /** Small label above the heading. All caps in the design. @maxLength 24 */
  Eyebrow?: Field<string>;

  /** Two-line clamp on mobile — keep it tight. @maxLength 60 */
  Heading: Field<string>;

  /** Body copy. Inline links fine, no headings. @maxLength 220 */
  Body: RichTextField;

  /** 16:9. Alt text required for AA compliance. */
  Image: ImageField;

  PrimaryCta: LinkField;

  /** Omit unless there's a genuine secondary action. */
  SecondaryCta?: LinkField;
};

type PromoSplitProps = ComponentProps & { fields: PromoSplitFields };

const PromoSplit = ({ fields, params }: PromoSplitProps) => {
  const variant = params?.variant ?? "image-left";
  return <section className={`promo-split promo-split--${variant}`}>{/* … */}</section>;
};

export default withDatasourceCheck()<PromoSplitProps>(PromoSplit);
