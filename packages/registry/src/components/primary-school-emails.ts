/**
 * Maps a {@link PrimarySchool} option value (stable kebab-case key) to the
 * school's notification inbox. Copied verbatim from `form-processor-api`'s
 * `primarySchoolToEmailMap` (the legacy, now-decommissioned sender) so the two
 * never diverge while routing moves here.
 *
 * Addresses end in either `@mes.gov.bb` or `@govtech.bb`. One deliberate
 * oddity preserved verbatim: `elliot-belgrave -> BoscobelPrimary@mes.gov.bb`
 * (a school rename, not a typo).
 *
 * The guard spec (`primary-school-emails.spec.ts`) asserts this map stays 1:1
 * with `PrimarySchool.options` — every option has an entry, and there are no
 * orphan keys.
 */
export const SCHOOL_EMAILS: Record<string, string> = {
  "a-dacosta-edwards": "ADacostaEdwardsPrimary@mes.gov.bb",
  "all-saints-primary": "AllSaintsPrimary@mes.gov.bb",
  "arthur-smith-primary": "ArthurSmithPrimary@mes.gov.bb",
  "bay-primary-school": "BayPrimary@mes.gov.bb",
  "bayleys-primary": "BayleysPrimary@mes.gov.bb",
  "belmont-primary": "BelmontPrimary@mes.gov.bb",
  "blackman-gollop-primary": "BlackmanGollopPrimary@mes.gov.bb",
  "charles-f-broome": "CharlesFBroomeMemorialPrimary@mes.gov.bb",
  "christ-church-girls": "ChristChurchGirls@mes.gov.bb",
  "cuthbert-moore-primary": "CuthbertMoorePrimary@mes.gov.bb",
  "deacons-primary": "DeaconsPrimary@mes.gov.bb",
  "eagle-hall-primary": "EagleHallPrimary@mes.gov.bb",
  "eden-lodge": "EdenLodgePrimary@mes.gov.bb",
  "ellerton-primary": "EllertonPrimary@mes.gov.bb",
  "elliot-belgrave": "BoscobelPrimary@mes.gov.bb",
  "good-shepherd-primary": "GoodShepherdPrimary@mes.gov.bb",
  "gordon-greenidge-primary": "GordonGreenidgePrimary@mes.gov.bb",
  "gordon-walters": "GordonWaltersPrimary@mes.gov.bb",
  "grantley-prescod-memorial": "GrantleyPrescodMemorial@mes.gov.bb",
  "grazettes-primary": "GrazettesPrimary@mes.gov.bb",
  "half-moon-fort": "HalfMoonFortPrimary@mes.gov.bb",
  "hilda-skeene-primary": "HildaSkeenePrimary@mes.gov.bb",
  "hillaby-turners-hall": "HillabyTurnersHallPrimary@mes.gov.bb",
  "hindsbury-primary": "HindsburyPrimary@mes.gov.bb",
  "holy-innocents-primary": "HolyInnocentsPrimary@mes.gov.bb",
  "ignatius-byer-primary": "IgnatiusByerPrimary@mes.gov.bb",
  "kellys-fantastic-school": "kelly.roberts@govtech.bb",
  "lawrence-t-gay": "LawrenceTGayPrimary@mes.gov.bb",
  "luther-thorne-memorial": "LutherThorneMemorial@mes.gov.bb",
  "milton-lynch-primary": "MiltonLynchPrimary@mes.gov.bb",
  "mount-tabor-primary-school": "MountTaborPrimary@mes.gov.bb",
  "new-horizon-academy": "newhorizonsacademy@mes.gov.bb",
  "reynold-weekes-primary-school": "ReynoldWeekesPrimary@mes.gov.bb",
  "roland-edwards-primary": "RolandEdwardsPrimary@mes.gov.bb",
  "selah-primary-school": "SelahPrimary@mes.gov.bb",
  "sharon-primary": "SharonPrimary@mes.gov.bb",
  "st-albans-primary": "StAlbansPrimary@mes.gov.bb",
  "st-ambrose-primary": "StAmbrosePrimary@mes.gov.bb",
  "st-bartholomew-primary": "StBartholomewsPrimary@mes.gov.bb",
  "st-bernards-primary": "StBernardsPrimary@mes.gov.bb",
  "st-catherines-primary": "StCatherinesPrimary@mes.gov.bb",
  "st-christopher-primary": "StChristopherPrimary@mes.gov.bb",
  "st-elizabeth-primary": "StElizabethPrimary@mes.gov.bb",
  "st-george-primary": "StGeorgePrimary@mes.gov.bb",
  "st-giles-primary": "StGilesPrimary@mes.gov.bb",
  "st-james-primary": "StJamesPrimary@mes.gov.bb",
  "st-johns-primary": "StJohnsPrimary@mes.gov.bb",
  "st-joseph-primary": "StJosephPrimary@mes.gov.bb",
  "st-judes-primary": "StJudesPrimary@mes.gov.bb",
  "st-lawrence-primary": "StLawrencePrimary@mes.gov.bb",
  "st-lucys-primary": "StLucyPrimary@mes.gov.bb",
  "st-lukes-brighton-primary": "StLukesPrimary@mes.gov.bb",
  "st-margarets-primary-school": "StMargaretsPrimary@mes.gov.bb",
  "st-marks-primary": "StMarksPrimary@mes.gov.bb",
  "st-martins-mangrove": "StMartinsMangrovePrimary@mes.gov.bb",
  "st-marys-primary": "StMarysPrimary@mes.gov.bb",
  "st-matthews-primary": "StMatthewsPrimary@mes.gov.bb",
  "st-paul-primary": "StPaulsPrimary@mes.gov.bb",
  "st-philip-primary": "StPhilipPrimary@mes.gov.bb",
  "st-silas-primary": "StSilasPrimary@mes.gov.bb",
  "st-stephens-primary": "StStephensPrimary@mes.gov.bb",
  "the-ann-hill-school": "TheAnnHillSchool@mes.gov.bb",
  "the-irving-wilson-school": "TheIrvingWilsonSchool@mes.gov.bb",
  "vauxhall-primary": "VauxhallPrimary@mes.gov.bb",
  "welches-primary": "WelchesPrimary@mes.gov.bb",
  "wesley-hall-infants": "WesleyHallInfantsschool@mes.gov.bb",
  "wesley-hall-junior": "WesleyHallJunior@mes.gov.bb",
  "west-terrace": "WestTerracePrimary@mes.gov.bb",
  "westbury-primary": "WestburyPrimary@mes.gov.bb",
  "wilkie-cumberbatch": "WilkieCumberbatchPrimary@mes.gov.bb",
  "workmans-primary": "WorkmansPrimary@mes.gov.bb",
};

/**
 * Address used when a submitted school key has no {@link SCHOOL_EMAILS} entry.
 * The guard spec makes a real miss impossible for valid form input, but a
 * forged/empty value must still resolve to *something* — the `schoolEmail` op
 * must always return a non-empty string, because `resolveProcessors` validates
 * the whole processor batch together and a single failure drops every email
 * (including the applicant confirmation).
 */
export const SCHOOL_EMAIL_FALLBACK = "testing@govtech.bb";
