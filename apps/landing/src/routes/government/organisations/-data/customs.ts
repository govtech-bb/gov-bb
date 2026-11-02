import type { Org } from '../-orgs'

// Copy is the Figma prototype's (GOV.BB – 01 – Alpha, node 8133:937). None of
// its tasks has a page yet, so their links are placeholders.
export const ORG: Org = {
  slug: 'customs',
  kind: 'department',
  theme: {
    '--org-wall-00': '#6e5a3c',
    '--org-wall-10': '#faf6ee',
    '--org-wall-100': '#d8c29a',
    '--org-link': '#6e5a3c',
    '--org-shutter-100': '#6fafb1',
  },
  hero: {
    masthead: true,
    name: 'Customs and Excise Department',
    lede: 'We clear goods across the border, collect the duties and taxes on them, and protect Barbados at the port, the airport and every point of entry.',
    action: { label: 'Declare goods in ASYCUDA World' },
    link: { label: 'What you can bring in duty free' },
  },
  sections: [
    {
      type: 'tiles',
      title: 'What do you need to do?',
      items: [
        {
          title: 'Declare goods you are importing',
          description:
            'Submit a customs declaration in ASYCUDA World, or have a licensed broker do it for you.',
        },
        {
          title: 'Clear a barrel or personal effects',
          description:
            'What to bring to the port to collect a barrel, box or crate sent from overseas.',
        },
        {
          title: 'Check what you can bring in duty free',
          description:
            'Travellers’ allowances, and the goods that are restricted or prohibited.',
        },
        {
          title: 'Claim returning national concessions',
          description:
            'Duty relief on household effects under the Charter for Returning and Overseas Nationals.',
        },
        {
          title: 'Register for ASYCUDA World',
          description:
            'Get access to the electronic customs system as an importer, exporter or broker.',
        },
        {
          title: 'Apply for a customs broker licence',
          description:
            'Licensing and annual renewal for brokers and their clerks.',
        },
      ],
    },
    {
      type: 'steps',
      title: 'Import goods, step by step',
      tone: 'grey',
      items: [
        {
          title: 'Find the commodity code for your goods',
          description:
            'Every item has a code in the Barbados Customs Tariff, which follows the international Harmonised System.',
        },
        {
          title: 'Work out the value of your goods',
          description:
            'Duty is charged on the CIF value: the cost of the goods plus insurance and freight.',
        },
        {
          title: 'Make a customs declaration',
          description:
            'File in ASYCUDA World yourself, or appoint a licensed customs broker to file for you.',
        },
        {
          title: 'Pay the duties and taxes',
          description:
            'Import duty, environmental levy, excise tax and VAT are assessed on your declaration.',
        },
        {
          title: 'Collect your goods',
          description:
            'Once the declaration is cleared and paid, the goods are released from the port, airport or post office.',
        },
      ],
      warning:
        'Your goods can be seized if you do not declare them, and you may be fined or prosecuted.',
    },
    {
      type: 'facts',
      title: 'What you pay on imported goods',
      seeAll: { label: 'The Barbados Customs Tariff' },
      items: [
        {
          label: 'Import duty',
          value:
            '0% to 20% of the CIF value on most goods. Higher bound rates apply to some agricultural and manufactured products, 60% on jewellery, 50% on watches and 45% on motor cars.',
        },
        {
          label: 'Environmental levy',
          value:
            '1% of the CIF value on most goods. A small number of goods carry a specific rate.',
        },
        {
          label: 'Excise tax',
          value:
            'Charged on motor vehicles, tobacco products, alcoholic beverages and petroleum products.',
        },
        {
          label: 'Value added tax',
          value: 'Charged on the duty-paid value of most imported goods.',
        },
        {
          label: 'Cess',
          value:
            'A levy on specified goods, charged in addition to import duty.',
        },
      ],
    },
    {
      type: 'offices',
      title: 'Where to find us',
      tone: 'grey',
      withContact: true,
      items: [
        {
          name: 'Customs headquarters',
          address: ['Port Authority Building', 'University Row', 'St. Michael'],
          phone: '(246) 430-2300',
        },
        {
          name: 'Grantley Adams International Airport',
          address: ['Seawell', 'Christ Church'],
          phone: '(246) 428-0957',
        },
        {
          name: 'General Post Office',
          address: ['Cheapside', 'Bridgetown'],
          phone: '(246) 430-2300',
        },
        {
          name: 'Port St. Charles',
          address: ['Heywoods', 'St. Peter'],
          phone: '(246) 430-2300',
        },
      ],
    },
  ],
  contact: {
    heading: 'Contact Customs',
    phone: '(246) 430-2300',
    email: 'comptroller@customs.gov.bb',
    address: ['Port Authority Building', 'University Row', 'St. Michael'],
    openingHours: 'Monday to Friday, 8:15am to 4:30pm',
  },
}
