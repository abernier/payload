import { randomBytes } from 'crypto'

import type { PayloadRequest } from '../../packages/payload/src/express/types'
import type {
  ChainedRelation,
  CustomIdNumberRelation,
  CustomIdRelation,
  Director,
  Post,
  Relation,
} from './payload-types'

import payload from '../../packages/payload/src'
import { mapAsync } from '../../packages/payload/src/utilities/mapAsync'
import { initPayloadTest } from '../helpers/configHelpers'
import { RESTClient } from '../helpers/rest'
import config, {
  chainedRelSlug,
  customIdNumberSlug,
  customIdSlug,
  defaultAccessRelSlug,
  relationSlug,
  slug,
} from './config'

let client: RESTClient

type EasierChained = { id: string; relation: EasierChained }

describe('Relationships', () => {
  beforeAll(async () => {
    const { serverURL } = await initPayloadTest({ __dirname, init: { local: false } })
    client = new RESTClient(config, { serverURL, defaultSlug: slug })
    await client.login()
  })

  afterAll(async () => {
    if (typeof payload.db.destroy === 'function') {
      await payload.db.destroy(payload)
    }
  })

  beforeEach(async () => {
    await clearDocs()
  })

  describe('Querying', () => {
    describe('Relationships', () => {
      let post: Post
      let relation: Relation
      let filteredRelation: Relation
      let defaultAccessRelation: Relation
      let chained: ChainedRelation
      let chained2: ChainedRelation
      let chained3: ChainedRelation
      let customIdRelation: CustomIdRelation
      let customIdNumberRelation: CustomIdNumberRelation
      let generatedCustomId: string
      let generatedCustomIdNumber: number
      const nameToQuery = 'name'

      beforeEach(async () => {
        relation = await payload.create<Relation>({
          collection: relationSlug,
          data: {
            name: nameToQuery,
          },
        })

        filteredRelation = await payload.create<Relation>({
          collection: relationSlug,
          data: {
            name: nameToQuery,
            disableRelation: false,
          },
        })

        defaultAccessRelation = await payload.create<Relation>({
          collection: defaultAccessRelSlug,
          data: {
            name: 'default access',
          },
        })

        chained3 = await payload.create<ChainedRelation>({
          collection: chainedRelSlug,
          data: {
            name: 'chain3',
          },
        })

        chained2 = await payload.create<ChainedRelation>({
          collection: chainedRelSlug,
          data: {
            name: 'chain2',
            relation: chained3.id,
          },
        })

        chained = await payload.create<ChainedRelation>({
          collection: chainedRelSlug,
          data: {
            name: 'chain1',
            relation: chained2.id,
          },
        })

        chained3 = await payload.update<ChainedRelation>({
          collection: chainedRelSlug,
          id: chained3.id,
          data: {
            name: 'chain3',
            relation: chained.id,
          },
        })

        generatedCustomId = `custom-${randomBytes(32).toString('hex').slice(0, 12)}`
        customIdRelation = await payload.create<CustomIdRelation>({
          collection: customIdSlug,
          data: {
            id: generatedCustomId,
            name: 'custom-id',
          },
        })

        generatedCustomIdNumber = Math.floor(Math.random() * 1_000_000) + 1
        customIdNumberRelation = await payload.create<CustomIdNumberRelation>({
          collection: customIdNumberSlug,
          data: {
            id: generatedCustomIdNumber,
            name: 'custom-id-number',
          },
        })

        post = await createPost({
          relationField: relation.id,
          defaultAccessRelation: defaultAccessRelation.id,
          chainedRelation: chained.id,
          maxDepthRelation: relation.id,
          customIdRelation: customIdRelation.id,
          customIdNumberRelation: customIdNumberRelation.id,
          filteredRelation: filteredRelation.id,
        })

        await createPost() // Extra post to allow asserting totalDoc count
      })

      it('should prevent an unauthorized population of strict access', async () => {
        const { doc } = await client.findByID<Post>({ id: post.id, auth: false })
        expect(doc.defaultAccessRelation).toEqual(defaultAccessRelation.id)
      })

      it('should populate strict access when authorized', async () => {
        const { doc } = await client.findByID<Post>({ id: post.id })
        expect(doc.defaultAccessRelation).toEqual(defaultAccessRelation)
      })

      it('should use filterOptions to limit relationship options', async () => {
        const { doc } = await client.findByID<Post>({ id: post.id })

        expect(doc.filteredRelation).toMatchObject({ id: filteredRelation.id })

        await client.update<Relation>({
          id: filteredRelation.id,
          slug: relationSlug,
          data: { disableRelation: true },
        })

        const { doc: docAfterUpdatingRel } = await client.findByID<Post>({ id: post.id })

        // No change to existing relation
        expect(docAfterUpdatingRel.filteredRelation).toMatchObject({ id: filteredRelation.id })

        // Attempt to update post with a now filtered relation
        const { status, errors } = await client.update<Post>({
          id: post.id,
          data: { filteredRelation: filteredRelation.id },
        })

        expect(errors?.[0]).toMatchObject({
          name: 'ValidationError',
          message: expect.any(String),
          data: expect.anything(),
        })
        expect(status).toEqual(400)
      })

      describe('Custom ID', () => {
        it('should query a custom id relation', async () => {
          const { doc } = await client.findByID<Post>({ id: post.id })
          expect(doc?.customIdRelation).toMatchObject({ id: generatedCustomId })
        })

        it('should query a custom id number relation', async () => {
          const { doc } = await client.findByID<Post>({ id: post.id })
          expect(doc?.customIdNumberRelation).toMatchObject({ id: generatedCustomIdNumber })
        })

        it('should validate the format of text id relationships', async () => {
          await expect(async () =>
            createPost({
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore Sending bad data to test error handling
              customIdRelation: 1234,
            }),
          ).rejects.toThrow('The following field is invalid: customIdRelation')
        })

        it('should validate the format of number id relationships', async () => {
          await expect(async () =>
            createPost({
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore Sending bad data to test error handling
              customIdNumberRelation: 'bad-input',
            }),
          ).rejects.toThrow('The following field is invalid: customIdNumberRelation')
        })

        it('should allow update removing a relationship', async () => {
          const result = await client.update<Post>({
            slug,
            id: post.id,
            data: {
              relationField: null,
            },
          })

          expect(result.status).toEqual(200)
          expect(result.doc.relationField).toBeFalsy()
        })
      })

      describe('depth', () => {
        it('should populate to depth', async () => {
          const { doc } = await client.findByID<Post>({ id: post.id, options: { depth: 2 } })
          const depth0 = doc?.chainedRelation as EasierChained
          expect(depth0.id).toEqual(chained.id)
          expect(depth0.relation.id).toEqual(chained2.id)
          expect(depth0.relation.relation as unknown as string).toEqual(chained3.id)
          expect(depth0.relation.relation).toEqual(chained3.id)
        })

        it('should only populate ID if depth 0', async () => {
          const { doc } = await client.findByID<Post>({ id: post.id, options: { depth: 0 } })
          expect(doc?.chainedRelation).toEqual(chained.id)
        })

        it('should respect maxDepth at field level', async () => {
          const { doc } = await client.findByID<Post>({ id: post.id, options: { depth: 1 } })
          expect(doc?.maxDepthRelation).toEqual(relation.id)
          expect(doc?.maxDepthRelation).not.toHaveProperty('name')
          // should not affect other fields
          expect(doc?.relationField).toMatchObject({ id: relation.id, name: relation.name })
        })
      })
    })

    describe('Nested Querying', () => {
      let thirdLevelID: string
      let secondLevelID: string
      let firstLevelID: string

      beforeAll(async () => {
        const thirdLevelDoc = await payload.create({
          collection: 'chained',
          data: {
            name: 'third',
          },
        })

        thirdLevelID = thirdLevelDoc.id

        const secondLevelDoc = await payload.create({
          collection: 'chained',
          data: {
            name: 'second',
            relation: thirdLevelID,
          },
        })

        secondLevelID = secondLevelDoc.id

        const firstLevelDoc = await payload.create({
          collection: 'chained',
          data: {
            name: 'first',
            relation: secondLevelID,
          },
        })

        firstLevelID = firstLevelDoc.id
      })

      it('should allow querying one level deep', async () => {
        const query1 = await payload.find({
          collection: 'chained',
          where: {
            'relation.name': {
              equals: 'second',
            },
          },
        })

        expect(query1.docs).toHaveLength(1)
        expect(query1.docs[0].id).toStrictEqual(firstLevelID)

        const query2 = await payload.find({
          collection: 'chained',
          where: {
            'relation.name': {
              equals: 'third',
            },
          },
        })

        expect(query2.docs).toHaveLength(1)
        expect(query2.docs[0].id).toStrictEqual(secondLevelID)
      })

      it('should allow querying two levels deep', async () => {
        const query = await payload.find({
          collection: 'chained',
          where: {
            'relation.relation.name': {
              equals: 'third',
            },
          },
        })

        expect(query.docs).toHaveLength(1)
        expect(query.docs[0].id).toStrictEqual(firstLevelID)
      })
    })

    describe('Nested Querying Separate Collections', () => {
      let director: Director

      beforeAll(async () => {
        // 1. create a director
        director = await payload.create({
          collection: 'directors',
          data: {
            name: 'Quentin Tarantino',
          },
        })

        // 2. create a movie
        const movie = await payload.create({
          collection: 'movies',
          data: {
            name: 'Pulp Fiction',
            director: director.id,
          },
        })

        // 3. create a screening
        await payload.create({
          collection: 'screenings',
          data: {
            movie: movie.id,
            name: 'Pulp Fiction Screening',
          },
        })
      })

      it('should allow querying two levels deep', async () => {
        const query = await payload.find({
          collection: 'screenings',
          where: {
            'movie.director.name': {
              equals: director.name,
            },
          },
        })

        expect(query.docs).toHaveLength(1)
      })
    })
    describe('Multiple Docs', () => {
      const movieList = [
        'Pulp Fiction',
        'Reservoir Dogs',
        'Once Upon a Time in Hollywood',
        'Shrek',
        'Shrek 2',
        'Shrek 3',
        'Scream',
        'The Matrix',
        'The Matrix Reloaded',
        'The Matrix Revolutions',
        'The Matrix Resurrections',
        'The Haunting',
        'The Haunting of Hill House',
        'The Haunting of Bly Manor',
        'Insidious',
      ]

      beforeAll(async () => {
        await Promise.all(
          movieList.map((movie) => {
            return payload.create({
              collection: 'movies',
              data: {
                name: movie,
              },
            })
          }),
        )
      })

      it('should return more than 10 docs in relationship', async () => {
        const allMovies = await payload.find({
          collection: 'movies',
          limit: 20,
        })

        const movieIDs = allMovies.docs.map((doc) => doc.id)

        await payload.create({
          collection: 'directors',
          data: {
            name: 'Quentin Tarantino',
            movies: movieIDs,
          },
        })

        const director = await payload.find({
          collection: 'directors',
          where: {
            name: {
              equals: 'Quentin Tarantino',
            },
          },
        })

        expect(director.docs[0].movies.length).toBeGreaterThan(10)
      })

      it('should allow clearing hasMany relationships', async () => {
        const fiveMovies = await payload.find({
          collection: 'movies',
          limit: 5,
          depth: 0,
        })

        const movieIDs = fiveMovies.docs.map((doc) => doc.id)

        const stanley = await payload.create({
          collection: 'directors',
          data: {
            name: 'Stanley Kubrick',
            movies: movieIDs,
          },
        })

        expect(stanley.movies).toHaveLength(5)

        const stanleyNeverMadeMovies = await payload.update({
          collection: 'directors',
          id: stanley.id,
          data: {
            movies: null,
          },
        })

        expect(stanleyNeverMadeMovies.movies).toHaveLength(0)
      })
    })
  })

  describe('Creating', () => {
    describe('With transactions', () => {
      it('should be able to create filtered relations within a transaction', async () => {
        const req = {} as PayloadRequest
        req.transactionID = await payload.db.beginTransaction?.()
        const related = await payload.create({
          req,
          collection: relationSlug,
          data: {
            name: 'parent',
          },
        })
        const withRelation = await payload.create({
          req,
          collection: slug,
          data: {
            filteredRelation: related.id,
          },
        })

        if (req.transactionID) {
          await payload.db.commitTransaction?.(req.transactionID)
        }

        expect(withRelation.filteredRelation.id).toEqual(related.id)
      })
    })
  })
})

async function createPost(overrides?: Partial<Post>) {
  return payload.create({ collection: slug, data: { title: 'title', ...overrides } })
}

async function clearDocs(): Promise<void> {
  const allDocs = await payload.find({ collection: slug, limit: 100 })
  const ids = allDocs.docs.map((doc) => doc.id)
  await mapAsync(ids, async (id) => {
    await payload.delete({ collection: slug, id })
  })
}
