import type { Org } from '../-orgs'

const FORMULARY_URL = 'https://formulary.drugservice.gov.bb/bndf2022/menu.php'
const SPECIAL_BENEFIT_SERVICE =
  '/health-and-emergency-services/free-or-subsidised-medication'

// Copy is the Figma prototype's (GOV.BB – 01 – Alpha, node 8120:733).
export const ORG: Org = {
  slug: 'drug-service',
  kind: 'department',
  theme: {
    '--org-wall-10': '#e9f8f9',
    '--org-wall-40': '#a9e7e9',
    '--org-wall-100': '#2fc6cc',
    '--org-link': '#006a72',
    '--org-shutter-100': '#ff7f6b',
  },
  hero: {
    name: 'Barbados Drug Service',
    lede: 'Quality medicines at an affordable price, through the Barbados National Drug Formulary and the pharmacies that dispense from it.',
    logo: {
      src: '/images/org/barbados-drug-service.png',
      alt: 'Barbados Drug Service',
    },
    action: {
      label: 'Check the National Drug Formulary',
      href: FORMULARY_URL,
      external: true,
    },
    link: { label: 'Special Benefit Service', href: SPECIAL_BENEFIT_SERVICE },
    caption: 'Photo: a Drug Service pharmacy counter',
  },
  sections: [
    {
      type: 'service-list',
      title: 'Services',
      withContact: true,
      items: [
        {
          title: 'Special Benefit Service',
          description:
            'Free Formulary medicines for children, people over 65 and anyone living with a listed chronic condition.',
          href: SPECIAL_BENEFIT_SERVICE,
        },
        {
          title: 'Barbados National Drug Formulary',
          description:
            'The list of medicines the Drug Service supplies to the public and private sector, reviewed by the Drug Formulary Committee.',
          href: FORMULARY_URL,
          external: true,
        },
        {
          title: 'Drug Service pharmacies',
          description:
            'Find a public pharmacy or a participating private pharmacy that dispenses under the Drug Service.',
          href: '/health-and-emergency-services/find-an-open-pharmacy',
        },
        {
          title: 'Validation of National Registration Number',
          description:
            'Check a National Registration Number is valid before dispensing under the Special Benefit Service.',
        },
        {
          title: 'Drug Information Service',
          description:
            'Advice on medicines for prescribers, pharmacists and the public.',
        },
      ],
    },
    {
      type: 'cards',
      title: 'Publications',
      seeAll: { label: 'All publications' },
      tone: 'grey',
      items: [
        {
          title: 'Barbados National Drug Formulary, 36th edition',
          description:
            'The current Formulary and Protocol, with a summary of what changed from the 35th edition.',
          caption: 'Cover: Barbados National Drug Formulary, 36th edition',
        },
        {
          title: 'Prescription pricing guide 2018 to 2020',
          description:
            'What patients pay for Formulary medicines at participating pharmacies.',
          caption: 'Cover: Prescription pricing guide 2018 to 2020',
        },
        {
          title: 'Products available under MPC 38',
          description:
            'Medicines supplied under the current Multi-source Pharmaceutical Contract.',
          caption: 'Cover: Products available under MPC 38',
        },
      ],
    },
    {
      type: 'actions',
      title: 'Report a problem with a medicine',
      items: [
        { label: 'Report an adverse drug reaction' },
        { label: 'Report a vaccine side effect' },
        { label: 'Report a product quality issue' },
      ],
    },
    {
      type: 'news',
      title: 'News and announcements',
      seeAll: { label: 'All news' },
      tone: 'grey',
      items: [
        {
          date: '2018-03-27',
          title: 'Formulary and Protocol for 2018 to 2020',
          summary:
            'The 36th edition of the Barbados National Drug Formulary is now in effect.',
        },
        {
          date: '2018-03-27',
          title: 'Changes to the Barbados National Drug Formulary',
          summary:
            'Four major changes to the 36th edition, including brands that stay on the Formulary under a different name.',
        },
        {
          date: '2018-03-26',
          title: 'What do I need to know about the changes to the Formulary?',
          summary:
            'Whether you can still get your medicine as before, and what to ask your pharmacist.',
        },
      ],
    },
  ],
  contact: {
    heading: 'Contact the Drug Service',
    phone: '(246) 535-4300',
    email: 'info@drugservice.gov.bb',
    address: ['6th Floor, Warrens Tower II', 'Warrens', 'St. Michael'],
    openingHours: 'Monday to Friday, 8:15am to 4:30pm',
  },
}
