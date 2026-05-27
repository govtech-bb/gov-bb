import type { CollectionConfig } from 'payload'
import { anyone, isAdmin } from '../access/roles'

const slugDescription =
  'URL-safe id, lowercase with hyphens (e.g. travel-id-citizenship). Used in page URLs — changing it breaks existing links.'

export const Categories: CollectionConfig = {
  slug: 'categories',
  labels: { singular: 'Category', plural: 'Categories' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug'],
    description: 'The top-level groupings services are listed under on the site.',
    group: 'Topics & categories',
  },
  access: {
    read: anyone,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: { description: slugDescription },
    },
    {
      name: 'description',
      type: 'textarea',
      admin: { description: 'One sentence shown under the category heading on the site.' },
    },
  ],
}

export const Subcategories: CollectionConfig = {
  slug: 'subcategories',
  labels: { singular: 'Subcategory', plural: 'Subcategories' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'parent', 'slug'],
    description: 'Optional second level within a category. Most categories have none.',
    group: 'Topics & categories',
  },
  access: {
    read: anyone,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      name: 'slug',
      type: 'text',
      required: true,
      index: true,
      admin: { description: slugDescription },
    },
    {
      name: 'parent',
      type: 'relationship',
      relationTo: 'categories',
      required: true,
      admin: { description: 'The category this subcategory belongs to.' },
    },
    { name: 'description', type: 'textarea' },
  ],
}
