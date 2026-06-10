export interface SubCategory {
  slug: string
  title: string
  description?: string
}

export interface Category {
  slug: string
  title: string
  description?: string
  subcategories?: Array<SubCategory>
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
    subcategories: [
      {
        slug: 'youth-development-leadership',
        title: 'Youth development and leadership',
        description:
          'Long-term training, mentorship and leadership pathways for young people.',
      },
      {
        slug: 'skills-trades-vocational-training',
        title: 'Skills, trades and vocational training',
        description:
          'Practical courses and workshops in trades, technology and creative skills.',
      },
      {
        slug: 'entrepreneurship-business',
        title: 'Entrepreneurship and business',
        description:
          'Support for young people starting and growing their own ventures.',
      },
      {
        slug: 'arts-culture',
        title: 'Arts and culture',
        description:
          'Creative programmes, performances and content celebrating Barbadian culture.',
      },
      {
        slug: 'children-families-community',
        title: 'Children, families and the wider community',
        description:
          'Programmes, volunteering opportunities and services for children, families and neighbourhoods.',
      },
    ],
  },
  {
    slug: 'ministry-of-youth',
    title: 'Ministry of Youth',
    description:
      'Programmes, training and volunteering opportunities run by the Division of Youth Affairs',
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
  {
    slug: 'education',
    title: 'Education',
    description:
      'Apply for school places and exams, claim education grants, and manage your child’s schooling',
  },
  {
    slug: 'health-and-emergency-services',
    title: 'Health and emergency services',
    description:
      'Prepare for hurricane season, find an emergency shelter, and reach key emergency contacts',
  },
]

export const CATEGORY_BY_SLUG: Record<string, Category> = Object.fromEntries(
  CATEGORIES.map((c) => [c.slug, c]),
)

export function getSubcategory(
  categorySlug: string,
  subcategorySlug: string,
): SubCategory | undefined {
  return CATEGORY_BY_SLUG[categorySlug]?.subcategories?.find(
    (s) => s.slug === subcategorySlug,
  )
}
