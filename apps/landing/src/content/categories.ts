export interface Category {
  slug: string
  title: string
  description?: string
}

export const CATEGORIES: Array<Category> = [
  {
    slug: 'family-birth-relationships',
    title: 'Family, birth and relationships',
    description:
      'Managing key life events and family responsibilities, from registering a birth to caring for others',
  },
  {
    slug: 'work-employment',
    title: 'Work and employment',
    description: 'Find a job, develop skills, or manage employment changes',
  },
  {
    slug: 'money-financial-support',
    title: 'Money and financial support',
    description: 'Get help with money, benefits, taxes or government payments',
  },
  {
    slug: 'pensions-and-gratuities',
    title: 'Pensions and Gratuities',
    description:
      'Estimate your public sector pension and find out about retirement ages and pensionable service',
  },
  {
    slug: 'youth-and-community',
    title: 'Youth and Community Programmes',
    description:
      'Programmes, training, workshops and volunteering opportunities for young people in Barbados',
  },
  {
    slug: 'travel-id-citizenship',
    title: 'Travel, ID and citizenship',
    description: 'Travel, drive or prove your identity and status',
  },
  {
    slug: 'business-trade',
    title: 'Business and trade',
    description:
      'Start, manage or grow a business, and understand legal and tax obligations',
  },
  {
    slug: 'public-safety',
    title: 'Public safety',
    description: 'Reporting crime, raising a concern and safeguarding',
  },
]

export const CATEGORY_BY_SLUG: Record<string, Category> = Object.fromEntries(
  CATEGORIES.map((c) => [c.slug, c]),
)
