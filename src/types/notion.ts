import {
  CheckboxPropertyItemObjectResponse,
  DatePropertyItemObjectResponse,
  NumberPropertyItemObjectResponse,
  RelationPropertyItemObjectResponse,
  RichTextPropertyItemObjectResponse,
  SelectPropertyItemObjectResponse,
  TitlePropertyItemObjectResponse,
} from '@notionhq/client/build/src/api-endpoints'

export type NotionTitleProperty = TitlePropertyItemObjectResponse
export type NotionRichTextProperty = RichTextPropertyItemObjectResponse
export type NotionNumberProperty = NumberPropertyItemObjectResponse
export type NotionSelectProperty = SelectPropertyItemObjectResponse
export type NotionCheckboxProperty = CheckboxPropertyItemObjectResponse
export type NotionDateProperty = DatePropertyItemObjectResponse
export type NotionRelationProperty = RelationPropertyItemObjectResponse

// Union type for all property types
export type NotionProperty =
  | NotionTitleProperty
  | NotionRichTextProperty
  | NotionNumberProperty
  | NotionSelectProperty
  | NotionCheckboxProperty
  | NotionDateProperty
  | NotionRelationProperty

// Type for page properties object (dynamic structure)
// Using a more flexible type that allows property access
export type NotionPageProperties = Record<string, NotionProperty>

// Note: NotionPageProperties is a Record where each property can be any NotionProperty type
// To access specific property types safely, use type guards (isRelationProperty, etc.)
// or type assertions: (props.scaffold_id as NotionRelationProperty)?.relation

// Type guard functions
export function isTitleProperty(prop: unknown): prop is NotionTitleProperty {
  return (
    typeof prop === 'object' &&
    prop !== null &&
    'type' in prop &&
    prop.type === 'title' &&
    'title' in prop &&
    Array.isArray(prop.title)
  )
}

export function isRichTextProperty(prop: unknown): prop is NotionRichTextProperty {
  return (
    typeof prop === 'object' &&
    prop !== null &&
    'type' in prop &&
    prop.type === 'rich_text' &&
    'rich_text' in prop &&
    Array.isArray(prop.rich_text)
  )
}

export function isRelationProperty(prop: unknown): prop is NotionRelationProperty {
  return (
    typeof prop === 'object' &&
    prop !== null &&
    'type' in prop &&
    prop.type === 'relation' &&
    'relation' in prop &&
    Array.isArray(prop.relation)
  )
}

export function isDateProperty(prop: unknown): prop is NotionDateProperty {
  return (
    typeof prop === 'object' &&
    prop !== null &&
    'type' in prop &&
    prop.type === 'date' &&
    'date' in prop
  )
}

export function isNumberProperty(prop: unknown): prop is NotionNumberProperty {
  return (
    typeof prop === 'object' &&
    prop !== null &&
    'type' in prop &&
    prop.type === 'number' &&
    'number' in prop
  )
}

export function isSelectProperty(prop: unknown): prop is NotionSelectProperty {
  return (
    typeof prop === 'object' &&
    prop !== null &&
    'type' in prop &&
    prop.type === 'select' &&
    'select' in prop
  )
}
