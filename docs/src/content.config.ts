import { defineCollection } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { blogSchema } from 'starlight-blog/schema';

export const collections = {
	// Blog posts are docs entries under content/docs/blog/, so they carry the
	// blog frontmatter on top of Starlight's own.
	docs: defineCollection({ loader: docsLoader(), schema: docsSchema({ extend: blogSchema }) }),
};
