import type { SerializedEditorState } from 'lexical'
import type { Field, RichTextField, TextField } from 'payload/types'

import type { LexicalRichTextAdapter, SanitizedEditorConfig } from '../../../../../index'
import type { AdapterProps } from '../../../../../types'
import type { HTMLConverter } from '../converter/types'
import type { HTMLConverterFeatureProps } from '../index'

import { convertLexicalToHTML } from '../converter'
import { defaultHTMLConverters } from '../converter/defaultConverters'

type Props = {
  name: string
}

/**
 * Combines the default HTML converters with HTML converters found in the features, and with HTML converters configured in the htmlConverter feature.
 *
 * @param editorConfig
 */
export const consolidateHTMLConverters = ({
  editorConfig,
}: {
  editorConfig: SanitizedEditorConfig
}) => {
  const htmlConverterFeature = editorConfig.resolvedFeatureMap.get('htmlConverter')
  const htmlConverterFeatureProps: HTMLConverterFeatureProps = htmlConverterFeature?.props

  const defaultConvertersWithConvertersFromFeatures = defaultHTMLConverters

  for (const converter of editorConfig.features.converters.html) {
    defaultConvertersWithConvertersFromFeatures.push(converter)
  }

  const finalConverters =
    htmlConverterFeatureProps?.converters &&
    typeof htmlConverterFeatureProps?.converters === 'function'
      ? htmlConverterFeatureProps.converters({
          defaultConverters: defaultConvertersWithConvertersFromFeatures,
        })
      : (htmlConverterFeatureProps?.converters as HTMLConverter[]) ||
        defaultConvertersWithConvertersFromFeatures

  return finalConverters
}

export const lexicalHTML: (
  /**
   * A string which matches the lexical field name you want to convert to HTML.
   *
   * This has to be a SIBLING field of this lexicalHTML field - otherwise, it won't be able to find the lexical field.
   **/
  lexicalFieldName: string,
  props: Props,
) => TextField = (lexicalFieldName, props) => {
  const { name = 'lexicalHTML' } = props
  return {
    name: name,
    admin: {
      hidden: true,
    },
    hooks: {
      afterRead: [
        async ({ collection, field, siblingData }) => {
          // find the path of this field, as well as its sibling fields, by looking for this `field` in collection.fields and traversing it recursively
          function findFieldPathAndSiblingFields(
            fields: Field[],
            path: string[],
          ): {
            path: string[]
            siblingFields: Field[]
          } {
            for (const curField of fields) {
              if (curField === field) {
                return {
                  path: [...path, curField.name],
                  siblingFields: fields,
                }
              }

              if ('fields' in curField && 'name' in curField) {
                const result = findFieldPathAndSiblingFields(curField.fields, [
                  ...path,
                  curField.name,
                ])
                if (result) {
                  return result
                }
              }
            }

            return null
          }
          const { path, siblingFields } = findFieldPathAndSiblingFields(collection.fields, [])

          const lexicalField: RichTextField<SerializedEditorState, AdapterProps> =
            siblingFields.find(
              (field) => 'name' in field && field.name === lexicalFieldName,
            ) as RichTextField<SerializedEditorState, AdapterProps>

          const lexicalFieldData: SerializedEditorState = siblingData[lexicalFieldName]

          if (!lexicalFieldData) {
            return ''
          }

          if (!lexicalField) {
            throw new Error(
              'You cannot use the lexicalHTML field because the referenced lexical field was not found',
            )
          }

          const config = (lexicalField?.editor as LexicalRichTextAdapter)?.editorConfig

          if (!config) {
            throw new Error(
              'The linked lexical field does not have an editorConfig. This is needed for the lexicalHTML field.',
            )
          }

          if (!config?.resolvedFeatureMap?.has('htmlConverter')) {
            throw new Error(
              'You cannot use the lexicalHTML field because the linked lexical field does not have a HTMLConverterFeature',
            )
          }

          const finalConverters = consolidateHTMLConverters({
            editorConfig: config,
          })

          return await convertLexicalToHTML({
            converters: finalConverters,
            data: lexicalFieldData,
          })
        },
      ],
    },
    type: 'text',
  }
}
