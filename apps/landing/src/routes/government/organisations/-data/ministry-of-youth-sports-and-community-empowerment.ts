import type { Org } from '../-orgs'

// Copy is the Figma prototype's (GOV.BB – 01 – Alpha, node 8059:549); the
// phone number and news are placeholders until the ministry supplies them.
export const ORG: Org = {
  slug: 'ministry-of-youth-sports-and-community-empowerment',
  kind: 'ministry',
  theme: {
    '--org-wall-10': '#edf3fd',
    '--org-wall-40': '#bbd3f6',
    '--org-wall-100': '#4f8fe8',
    '--org-link': '#1f4e9a',
    '--org-shutter-100': '#ff9a3c',
  },
  hero: {
    name: 'Ministry of Youth, Sports and Community Empowerment',
    lede: 'Camps, coaching, training and grants for young Barbadians, and the community centres that bring every neighbourhood together.',
    logo: {
      src: '/images/org/division-of-youth-affairs.png',
      alt: 'Division of Youth Affairs',
    },
    action: {
      label: 'Register for a summer camp',
      href: '/work-employment/register-summer-camp',
    },
    link: { label: 'All our programmes' },
    caption: 'Photo: what would go here',
  },
  sections: [
    {
      type: 'cards',
      title: 'Our programmes',
      seeAll: { label: 'All six programmes' },
      items: [
        {
          title: 'National Summer Camp Programme',
          description:
            'Day camps in every parish each July and August, run with community groups and schools.',
          caption: 'Photo: National Summer Camp Programme',
        },
        {
          title: 'Barbados YouthADVANCE Corps',
          description:
            'Training, discipline and national service for young adults, with a stipend.',
          caption: 'Photo: Barbados YouthADVANCE Corps',
        },
        {
          title: 'Youth Development Programme',
          description:
            'Sports coaching, life skills and leadership in community centres year-round.',
          caption: 'Photo: Youth Development Programme',
        },
      ],
    },
    {
      type: 'tiles',
      title: 'Services',
      items: [
        {
          title: 'Register for a summer camp',
          description:
            'Sign a child up for a National Summer Camp Programme camp.',
          href: '/work-employment/register-summer-camp',
        },
        {
          title: 'Apply to be a Camp Director or Assistant Camp Director',
          description:
            'Volunteer to lead a camp in the National Summer Camp Programme.',
          href: '/ministry-of-youth/camp-director-application',
        },
        {
          title: 'Apply to the Barbados YouthADVANCE Corps (BYAC)',
          description:
            'A paid programme of training and national service for 18 to 35 year olds.',
          href: '/work-employment/apply-to-the-barbados-youthadvance-corps',
        },
        {
          title: 'Apply to volunteer at a sports camp',
          description: 'Coach or assist at a school-holiday sports camp.',
          href: '/work-employment/apply-to-volunteer-at-a-sports-camp',
        },
        {
          title: 'Register for a YDP Community Sports Training programme',
          description:
            'Free community coaching in football, cricket, athletics and more.',
          href: '/work-employment/register-for-community-sports-training-programme',
        },
        {
          title: 'Apply to be a Project Protégé mentor',
          description:
            'Mentor a young person for a year through the Division of Youth Affairs.',
          href: '/work-employment/apply-to-be-a-project-protege-mentor',
        },
        {
          title: 'Apply for the National Summer Camp Science Programme',
          description:
            'A residential science programme for secondary school students.',
          href: '/education/apply-national-science-camp-2026',
        },
        {
          title: 'Register for Job Start Plus',
          description:
            'Work placements and a stipend for young people entering the workforce.',
          href: '/work-employment/apply-to-jobstart-plus-programme',
        },
      ],
    },
    {
      type: 'news',
      title: 'News and updates',
      seeAll: { label: 'All news' },
      withContact: true,
      items: [
        {
          date: '2026-09-18',
          title: 'YouthADVANCE Corps opens its 2027 intake',
          summary:
            'Applications for the next BYAC cohort are open until the end of October.',
        },
        {
          date: '2026-09-04',
          title: 'Three new venues join Community Sports Training',
          summary:
            'Coaching now runs at community centres in St. Lucy, St. John and Christ Church.',
        },
        {
          date: '2026-08-21',
          title: 'Summer camps close with a record parish showcase',
          summary:
            'More than 40 camps took part in this year’s closing performances.',
        },
      ],
    },
  ],
  contact: {
    heading: 'Contact the ministry',
    phone: '(246) 000-0000',
    email: 'enquiries@youth.gov.bb',
    address: ['Sky Mall', 'Haggatt Hall', 'St. Michael'],
    openingHours: 'Monday to Friday, 8:15am to 4:30pm',
  },
}
