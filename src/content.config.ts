import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/**
 * Structured content models for the AVATOR ecosystem.
 * Future products, technologies, systems and research notes are added by
 * dropping a markdown file into the matching src/content/ directory —
 * no page markup changes required.
 */

const technologies = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/technologies' }),
  schema: z.object({
    title: z.string(),
    designation: z.string(), // technical code, e.g. "AVT·LNG"
    summary: z.string(),
    status: z.enum(['active', 'development', 'research']),
    capabilities: z.array(z.string()),
    order: z.number(),
  }),
});

const products = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/products' }),
  schema: z.object({
    name: z.string(),
    designation: z.string(),
    tagline: z.string(),
    summary: z.string(),
    status: z.enum(['in-development', 'private-preview', 'available']),
    category: z.string(),
    order: z.number(),
    plans: z
      .array(
        z.object({
          name: z.string(),
          description: z.string(),
          price: z.string().optional(),
        }),
      )
      .optional(),
  }),
});

const work = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/work' }),
  schema: z.object({
    title: z.string(),
    designation: z.string(),
    discipline: z.string(),
    summary: z.string(),
    status: z.string(),
    order: z.number(),
  }),
});

const research = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/research' }),
  schema: z.object({
    title: z.string(),
    designation: z.string(),
    summary: z.string(),
    date: z.string(),
    order: z.number(),
  }),
});

export const collections = { technologies, products, work, research };
