import { Field, RichTextField } from "@sitecore-jss/sitecore-jss-nextjs";

/** Plain text block with no placeholder tag. */
export type TextBlockFields = {
  Heading: Field<string>;
  Body: RichTextField;
  Theme: CustomThemeField;
};

export default function TextBlock() {
  return null;
}
