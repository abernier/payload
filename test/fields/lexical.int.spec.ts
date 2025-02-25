import type { SerializedEditorState } from 'lexical'

import { GraphQLClient } from 'graphql-request'

import type { SanitizedConfig } from '../../packages/payload/src/config/types'
import type { PaginatedDocs } from '../../packages/payload/src/database/types'
import type {
  SerializedBlockNode,
  SerializedLinkNode,
  SerializedUploadNode,
} from '../../packages/richtext-lexical/src'
import type { SerializedRelationshipNode } from '../../packages/richtext-lexical/src'
import type { RichTextField } from './payload-types'

import payload from '../../packages/payload/src'
import { initPayloadTest } from '../helpers/configHelpers'
import { RESTClient } from '../helpers/rest'
import configPromise from '../uploads/config'
import { arrayDoc } from './collections/Array/shared'
import { lexicalDocData } from './collections/Lexical/data'
import { lexicalMigrateDocData } from './collections/LexicalMigrate/data'
import { richTextDocData } from './collections/RichText/data'
import { generateLexicalRichText } from './collections/RichText/generateLexicalRichText'
import { textDoc } from './collections/Text/shared'
import { clearAndSeedEverything } from './seed'
import {
  arrayFieldsSlug,
  lexicalFieldsSlug,
  lexicalMigrateFieldsSlug,
  richTextFieldsSlug,
  textFieldsSlug,
  uploadsSlug,
} from './slugs'

let client: RESTClient
let graphQLClient: GraphQLClient
let serverURL: string
let config: SanitizedConfig
let token: string

let createdArrayDocID: number | string = null
let createdJPGDocID: number | string = null
let createdTextDocID: number | string = null
let createdRichTextDocID: number | string = null

describe('Lexical', () => {
  beforeAll(async () => {
    ;({ serverURL } = await initPayloadTest({ __dirname, init: { local: false } }))
    config = await configPromise

    client = new RESTClient(config, { defaultSlug: richTextFieldsSlug, serverURL })
    const graphQLURL = `${serverURL}${config.routes.api}${config.routes.graphQL}`
    graphQLClient = new GraphQLClient(graphQLURL)
    token = await client.login()
  })

  beforeEach(async () => {
    await clearAndSeedEverything(payload)
    client = new RESTClient(config, { defaultSlug: richTextFieldsSlug, serverURL })
    await client.login()

    createdArrayDocID = (
      await payload.find({
        collection: arrayFieldsSlug,
        where: {
          id: {
            exists: true,
          },
        },
      })
    ).docs[0].id

    createdJPGDocID = (
      await payload.find({
        collection: uploadsSlug,
        where: {
          id: {
            exists: true,
          },
        },
      })
    ).docs[0].id

    createdTextDocID = (
      await payload.find({
        collection: textFieldsSlug,
        where: {
          id: {
            exists: true,
          },
        },
      })
    ).docs[0].id

    createdRichTextDocID = (
      await payload.find({
        collection: richTextFieldsSlug,
        where: {
          id: {
            exists: true,
          },
        },
      })
    ).docs[0].id
  })

  describe('basic', () => {
    it('should allow querying on lexical content', async () => {
      const richTextDoc: RichTextField = (
        await payload.find({
          collection: richTextFieldsSlug,
          where: {
            title: {
              equals: richTextDocData.title,
            },
          },
          depth: 0,
        })
      ).docs[0] as never

      expect(richTextDoc?.lexicalCustomFields).toStrictEqual(
        JSON.parse(
          JSON.stringify(generateLexicalRichText())
            .replace(
              /"\{\{ARRAY_DOC_ID\}\}"/g,
              payload.db.defaultIDType === 'number'
                ? `${createdArrayDocID}`
                : `"${createdArrayDocID}"`,
            )
            .replace(
              /"\{\{UPLOAD_DOC_ID\}\}"/g,
              payload.db.defaultIDType === 'number' ? `${createdJPGDocID}` : `"${createdJPGDocID}"`,
            )
            .replace(
              /"\{\{TEXT_DOC_ID\}\}"/g,
              payload.db.defaultIDType === 'number'
                ? `${createdTextDocID}`
                : `"${createdTextDocID}"`,
            ),
        ),
      )
    })

    it('should populate respect depth parameter and populate link node relationship', async () => {
      const richTextDoc: RichTextField = (
        await payload.find({
          collection: richTextFieldsSlug,
          where: {
            title: {
              equals: richTextDocData.title,
            },
          },
          depth: 1,
        })
      ).docs[0] as never

      const seededDocument = JSON.parse(
        JSON.stringify(generateLexicalRichText())
          .replace(
            /"\{\{ARRAY_DOC_ID\}\}"/g,
            payload.db.defaultIDType === 'number'
              ? `${createdArrayDocID}`
              : `"${createdArrayDocID}"`,
          )
          .replace(
            /"\{\{UPLOAD_DOC_ID\}\}"/g,
            payload.db.defaultIDType === 'number' ? `${createdJPGDocID}` : `"${createdJPGDocID}"`,
          )
          .replace(
            /"\{\{TEXT_DOC_ID\}\}"/g,
            payload.db.defaultIDType === 'number' ? `${createdTextDocID}` : `"${createdTextDocID}"`,
          ),
      )

      expect(richTextDoc?.lexicalCustomFields).not.toStrictEqual(seededDocument) // The whole seededDocument should not match, as richTextDoc should now contain populated documents not present in the seeded document
      expect(richTextDoc?.lexicalCustomFields).toMatchObject(seededDocument) // subset of seededDocument should match

      const lexical: SerializedEditorState = richTextDoc?.lexicalCustomFields as never

      const linkNode: SerializedLinkNode = lexical.root.children[1].children[3]
      expect(linkNode.fields.doc.value.items[1].text).toStrictEqual(arrayDoc.items[1].text)
    })

    it('should populate relationship node', async () => {
      const richTextDoc: RichTextField = (
        await payload.find({
          collection: richTextFieldsSlug,
          where: {
            title: {
              equals: richTextDocData.title,
            },
          },
          depth: 1,
        })
      ).docs[0] as never

      const relationshipNode: SerializedRelationshipNode =
        richTextDoc.lexicalCustomFields.root.children.find((node) => node.type === 'relationship')

      expect(relationshipNode.value.text).toStrictEqual(textDoc.text)
    })

    it('should respect GraphQL rich text depth parameter and populate upload node', async () => {
      const query = `query {
        RichTextFields {
          docs {
            lexicalCustomFields(depth: 2)
          }
        }
      }`
      const response: {
        RichTextFields: PaginatedDocs<RichTextField>
      } = await graphQLClient.request(
        query,
        {},
        {
          Authorization: `JWT ${token}`,
        },
      )

      const { docs } = response.RichTextFields

      const uploadNode: SerializedUploadNode = docs[0].lexicalCustomFields.root.children.find(
        (node) => node.type === 'upload',
      )
      expect(uploadNode.value.media.filename).toStrictEqual('payload.png')
    })
  })
  describe('converters and migrations', () => {
    it('hTMLConverter: should output correct HTML for top-level lexical field', async () => {
      const lexicalDoc: RichTextField = (
        await payload.find({
          collection: lexicalMigrateFieldsSlug,
          where: {
            title: {
              equals: lexicalMigrateDocData.title,
            },
          },
          depth: 0,
        })
      ).docs[0] as never

      const htmlField: string = lexicalDoc?.lexicalSimple_html as never
      expect(htmlField).toStrictEqual('<p>simple</p>')
    })
    it('hTMLConverter: should output correct HTML for lexical field nested in group', async () => {
      const lexicalDoc: RichTextField = (
        await payload.find({
          collection: lexicalMigrateFieldsSlug,
          where: {
            title: {
              equals: lexicalMigrateDocData.title,
            },
          },
          depth: 0,
        })
      ).docs[0] as never

      const htmlField: string = lexicalDoc?.groupWithLexicalField?.lexicalInGroupField_html as never
      expect(htmlField).toStrictEqual('<p>group</p>')
    })
    it('hTMLConverter: should output correct HTML for lexical field nested in array', async () => {
      const lexicalDoc: RichTextField = (
        await payload.find({
          collection: lexicalMigrateFieldsSlug,
          where: {
            title: {
              equals: lexicalMigrateDocData.title,
            },
          },
          depth: 0,
        })
      ).docs[0] as never

      const htmlField1: string = lexicalDoc?.arrayWithLexicalField[0]
        .lexicalInArrayField_html as never
      const htmlField2: string = lexicalDoc?.arrayWithLexicalField[1]
        .lexicalInArrayField_html as never

      expect(htmlField1).toStrictEqual('<p>array 1</p>')
      expect(htmlField2).toStrictEqual('<p>array 2</p>')
    })
  })
  describe('advanced - blocks', () => {
    it('should not populate relationships in blocks if depth is 0', async () => {
      const lexicalDoc: RichTextField = (
        await payload.find({
          collection: lexicalFieldsSlug,
          where: {
            title: {
              equals: lexicalDocData.title,
            },
          },
          depth: 0,
        })
      ).docs[0] as never

      const lexicalField: SerializedEditorState = lexicalDoc?.lexicalWithBlocks as never

      const relationshipBlockNode: SerializedBlockNode = lexicalField.root.children[2] as never

      /**
       * Depth 1 population:
       */
      expect(relationshipBlockNode.fields.data.rel).toStrictEqual(createdJPGDocID)
    })

    it('should populate relationships in blocks with depth=1', async () => {
      const lexicalDoc: RichTextField = (
        await payload.find({
          collection: lexicalFieldsSlug,
          where: {
            title: {
              equals: lexicalDocData.title,
            },
          },
          depth: 1,
        })
      ).docs[0] as never

      const lexicalField: SerializedEditorState = lexicalDoc?.lexicalWithBlocks as never

      const relationshipBlockNode: SerializedBlockNode = lexicalField.root.children[2] as never

      /**
       * Depth 1 population:
       */
      expect(relationshipBlockNode.fields.data.rel.filename).toStrictEqual('payload.jpg')
    })

    it('should not populate relationship nodes inside of a sub-editor from a blocks node with 0 depth', async () => {
      const lexicalDoc: RichTextField = (
        await payload.find({
          collection: lexicalFieldsSlug,
          where: {
            title: {
              equals: lexicalDocData.title,
            },
          },
          depth: 0,
        })
      ).docs[0] as never

      const lexicalField: SerializedEditorState = lexicalDoc?.lexicalWithBlocks as never

      const subEditorBlockNode: SerializedBlockNode = lexicalField.root.children[3] as never

      const subEditor: SerializedEditorState = subEditorBlockNode.fields.data.richText

      const subEditorRelationshipNode: SerializedRelationshipNode = subEditor.root
        .children[0] as never

      /**
       * Depth 1 population:
       */
      expect(subEditorRelationshipNode.value.id).toStrictEqual(createdRichTextDocID)
      // But the value should not be populated and only have the id field:
      expect(Object.keys(subEditorRelationshipNode.value)).toHaveLength(1)
    })

    it('should populate relationship nodes inside of a sub-editor from a blocks node with 1 depth', async () => {
      const lexicalDoc: RichTextField = (
        await payload.find({
          collection: lexicalFieldsSlug,
          where: {
            title: {
              equals: lexicalDocData.title,
            },
          },
          depth: 1,
        })
      ).docs[0] as never

      const lexicalField: SerializedEditorState = lexicalDoc?.lexicalWithBlocks as never

      const subEditorBlockNode: SerializedBlockNode = lexicalField.root.children[3] as never

      const subEditor: SerializedEditorState = subEditorBlockNode.fields.data.richText

      const subEditorRelationshipNode: SerializedRelationshipNode = subEditor.root
        .children[0] as never

      /**
       * Depth 1 population:
       */
      expect(subEditorRelationshipNode.value.id).toStrictEqual(createdRichTextDocID)
      expect(subEditorRelationshipNode.value.title).toStrictEqual(richTextDocData.title)

      // Make sure that the referenced, popular document is NOT populated (that would require depth > 2):

      const populatedDocEditorState: SerializedEditorState = subEditorRelationshipNode.value
        .lexicalCustomFields as never

      const populatedDocEditorRelationshipNode: SerializedRelationshipNode = populatedDocEditorState
        .root.children[2] as never

      //console.log('populatedDocEditorRelatonshipNode:', populatedDocEditorRelationshipNode)

      /**
       * Depth 2 population:
       */
      expect(populatedDocEditorRelationshipNode.value.id).toStrictEqual(createdTextDocID)
      // But the value should not be populated and only have the id field - that's because it would require a depth of 2
      expect(Object.keys(populatedDocEditorRelationshipNode.value)).toHaveLength(1)
    })

    it('should populate relationship nodes inside of a sub-editor from a blocks node with depth 2', async () => {
      const lexicalDoc: RichTextField = (
        await payload.find({
          collection: lexicalFieldsSlug,
          where: {
            title: {
              equals: lexicalDocData.title,
            },
          },
          depth: 2,
        })
      ).docs[0] as never

      const lexicalField: SerializedEditorState = lexicalDoc?.lexicalWithBlocks as never

      const subEditorBlockNode: SerializedBlockNode = lexicalField.root.children[3] as never

      const subEditor: SerializedEditorState = subEditorBlockNode.fields.data.richText

      const subEditorRelationshipNode: SerializedRelationshipNode = subEditor.root
        .children[0] as never

      /**
       * Depth 1 population:
       */
      expect(subEditorRelationshipNode.value.id).toStrictEqual(createdRichTextDocID)
      expect(subEditorRelationshipNode.value.title).toStrictEqual(richTextDocData.title)

      // Make sure that the referenced, popular document is NOT populated (that would require depth > 2):

      const populatedDocEditorState: SerializedEditorState = subEditorRelationshipNode.value
        .lexicalCustomFields as never

      const populatedDocEditorRelationshipNode: SerializedRelationshipNode = populatedDocEditorState
        .root.children[2] as never

      /**
       * Depth 2 population:
       */
      expect(populatedDocEditorRelationshipNode.value.id).toStrictEqual(createdTextDocID)
      // Should now be populated (length 12)
      expect(populatedDocEditorRelationshipNode.value.text).toStrictEqual(textDoc.text)
    })
  })
})
