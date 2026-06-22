/**
 * Canonical Government of Barbados content category taxonomy — the single
 * source of truth for category slugs, titles, descriptions and the
 * subcategory tree.
 *
 * - Landing renders it (re-exported verbatim from
 *   `apps/landing/src/content/categories.ts`).
 * - form_builder's CMS reads it to offer categories, and appends a
 *   newly-created category back into THIS file via the GitHub API (see
 *   `insertCategoryEntry` in `apps/form_builder/app/routes/content/-lib.ts`,
 *   anchored on the `CATEGORY_BY_SLUG` line below) — so the write target and
 *   the source of truth stay one and the same.
 *
 * Pure data (no IO) so it is safe to import into browser bundles.
 */

export interface SubCategory {
  slug: string;
  title: string;
  description?: string;
}

export interface Category {
  slug: string;
  title: string;
  description?: string;
  subcategories?: Array<SubCategory>;
}

export const CATEGORY_TAXONOMY: Array<Category> = [
  {
    slug: "family-birth-relationships",
    title: "Family, birth and relationships",
    description:
      "Managing key life events and family responsibilities, from registering a birth to caring for others",
  },
  {
    slug: "work-employment",
    title: "Work and employment",
    description: "Find a job, develop skills, or manage employment changes",
  },
  {
    slug: "money-financial-support",
    title: "Money and financial support",
    description: "Get help with money, benefits, taxes or government payments",
  },
  {
    slug: "social-empowerment",
    title: "Social empowerment",
    description:
      "Apply for help at home, financial assistance, and programmes for older people and families, run by the Social Empowerment Agency and the National Assistance Board",
  },
  {
    slug: "pensions-and-gratuities",
    title: "Pensions and Gratuities",
    description:
      "Estimate your public sector pension and find out about retirement ages and pensionable service",
  },
  {
    slug: "youth-and-community",
    title: "Youth and Community Programmes",
    description:
      "Programmes, training, workshops and volunteering opportunities for young people in Barbados",
    subcategories: [
      {
        slug: "youth-development-leadership",
        title: "Youth development and leadership",
        description:
          "Long-term training, mentorship and leadership pathways for young people.",
      },
      {
        slug: "skills-trades-vocational-training",
        title: "Skills, trades and vocational training",
        description:
          "Practical courses and workshops in trades, technology and creative skills.",
      },
      {
        slug: "entrepreneurship-business",
        title: "Entrepreneurship and business",
        description:
          "Support for young people starting and growing their own ventures.",
      },
      {
        slug: "arts-culture",
        title: "Arts and culture",
        description:
          "Creative programmes, performances and content celebrating Barbadian culture.",
      },
      {
        slug: "children-families-community",
        title: "Children, families and the wider community",
        description:
          "Programmes, volunteering opportunities and services for children, families and neighbourhoods.",
      },
    ],
  },
  {
    slug: "ministry-of-youth",
    title: "Ministry of Youth",
    description:
      "Programmes, training and volunteering opportunities run by the Division of Youth Affairs",
  },
  {
    slug: "travel-id-citizenship",
    title: "Travel, ID and citizenship",
    description: "Travel, drive or prove your identity and status",
  },
  {
    slug: "business-trade",
    title: "Business and trade",
    description:
      "Start, manage or grow a business, and understand legal and tax obligations",
  },
  {
    slug: "public-safety",
    title: "Public safety",
    description: "Reporting crime, raising a concern and safeguarding",
  },
  {
    slug: "education",
    title: "Education",
    description:
      "Apply for school places and exams, claim education grants, and manage your child’s schooling",
  },
  {
    slug: "health-and-emergency-services",
    title: "Health and emergency services",
    description:
      "Prepare for hurricane season, find an emergency shelter, and reach key emergency contacts",
  },
  {
    slug: "housing",
    title: "Housing",
    description:
      "Apply for National Housing Corporation homes and land, use State land, and exercise tenant rights to buy a freehold",
  },
];

export const CATEGORY_BY_SLUG: Record<string, Category> = Object.fromEntries(
  CATEGORY_TAXONOMY.map((c) => [c.slug, c]),
);

export function getSubcategory(
  categorySlug: string,
  subcategorySlug: string,
): SubCategory | undefined {
  return CATEGORY_BY_SLUG[categorySlug]?.subcategories?.find(
    (s) => s.slug === subcategorySlug,
  );
}
