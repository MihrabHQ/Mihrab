# Learn sets: a shortlist to choose from

> **For review.** Written by `node scripts/hadith/draft-sets.js` from the packs in
> `build/hadith/v1`; edit the script, not the file. **The app shows these lists**
> (`ids` in `src/hadith/sets.json`, `"chosenBy": "rules"`) until a person has settled
> each set.

Learn's sets were whole HadeethEnc topics. That made "Foundations of faith" 156
hadith and "Worship in detail" 750, and "Family and neighbours" 12 — or 4, read in
Swedish. A set that is meant to be read through wants a few dozen hadith, chosen by
someone qualified to choose and put in an order that teaches.

**This is not that choice.** It is each topic narrowed by rules a script can check, so
the person choosing starts from a page instead of from 750 rows:

1. In the topics the set already covers (`src/hadith/sets.json`).
2. Reported by al-Bukhārī or Muslim, by HadeethEnc's own attribution — dropped for a
   set where fewer than 8 would pass (it says so under its heading).
3. No longer than 600 characters in English.
4. Spread over the topic's branches, so one branch does not fill the set.
5. Among those, the hadith translated into the most of the app's thirteen languages
   first. **Sv** says whether Swedish is one of them.
6. One row a title: where HadeethEnc holds a hadith twice, the better-translated entry.

Up to 25 for a "Starting out" set, 25 for "Building familiarity", 40 for "In depth".
The order within a set is HadeethEnc's, branch by branch; it has not been arranged.

To review: strike what should not be in a set, add what is missing (any HadeethEnc id
will do), and reorder. Put the settled ids in that set's `ids` in `sets.json` and
change its `"chosenBy"` from `"rules"` to who chose: this script then leaves it alone.

Texts and attributions: [HadeethEnc.com](https://hadeethenc.com), unmodified.

## At a glance

| Set | Level | Today (en) | Pass rules 2–3 | Shortlisted | In all 13 | In Swedish |
|---|---|---:|---:|---:|---:|---:|
| Foundations of faith | Starting out | 156 | 82 | 25 | 23 | 24 |
| Everyday worship | Starting out | 61 | 32 | 25 | 8 | 12 |
| Character and manners | Building familiarity | 192 | 116 | 25 | 12 | 25 |
| Purifying the heart | Building familiarity | 73 | 27 | 25 | 6 | 17 |
| Family and neighbours | Building familiarity | 12 | 7 | 7 | 1 | 4 |
| Virtues of deeds | Building familiarity | 58 | 30 | 25 | 7 | 14 |
| Creed | In depth | 471 | 221 | 40 | 40 | 40 |
| Worship in detail | In depth | 750 | 397 | 40 | 37 | 40 |
| The Prophet's life | In depth | 194 | 102 | 40 | 5 | 15 |

an-Nawawi's Forty and the two books are not listed: the first is an-Nawawi's own
choice and order, and the books are whole.

## Foundations of faith

*Starting out* · `foundations` · today: **156** hadith in English · pass rules 2–3: **82** · shortlisted: **25** (23 in all thirteen languages, 24 in Swedish)

| # | HadeethEnc | Hadith | Reported by | Languages | Sv | Branch |
|---:|---|---|---|---:|:-:|---|
| 1 | [65000](https://hadeethenc.com/en/browse/hadith/65000) | Islam is built on five | Agreed upon | 13/13 | yes | Islam |
| 2 | [65002](https://hadeethenc.com/en/browse/hadith/65002) | He who does good in Islam will not be punished for what he did during jāhiliyyah, and he who commits evil in Islam will be punished for the previous and later deeds | Agreed upon | 13/13 | yes | Islam |
| 3 | [4211](https://hadeethenc.com/en/browse/hadith/4211) | I have been commanded to fight people until they testify that there is no god but Allah and that Muhammad is the Messenger of Allah, establish prayer, and pay Zakah | Agreed upon | 13/13 | yes | Islam |
| 4 | [65009](https://hadeethenc.com/en/browse/hadith/65009) | for he did not ever say: My Lord, forgive my sins on the Day of Judgment | Narrated by Muslim | 13/13 | yes | Islam |
| 5 | [65013](https://hadeethenc.com/en/browse/hadith/65013) | Satan comes to one of you and says, 'Who created such and such, and who created such and such', until he says: 'Who created your Lord?' If a person experiences this, he should seek refuge with Allah and desist from that | Agreed upon | 13/13 | yes | Islam |
| 6 | [65015](https://hadeethenc.com/en/browse/hadith/65015) | Allah does not wrong a believer in a good deed; he will be given on account of it in this world and will be rewarded for it in the Hereafter | Narrated by Muslim | 13/13 | yes | Islam |
| 7 | [65016](https://hadeethenc.com/en/browse/hadith/65016) | You have embraced Islam along with your past good deeds | Agreed upon | 13/13 | yes | Islam |
| 8 | [65003](https://hadeethenc.com/en/browse/hadith/65003) | Do you think that if I perform the obligatory payers, fast Ramadan, treat the lawful as lawful, and treat the unlawful as unlawful, | Narrated by Muslim | 13/13 | yes | Branches of Faith |
| 9 | [65004](https://hadeethenc.com/en/browse/hadith/65004) | Purity is half of faith, al-hamdulillāh (praise be to Allah) fills the Scale, and subhān Allah wa al-hamdulillāh (glory and praise be to Allah) fills what is between the heavens and the earth | Narrated by Muslim | 13/13 | yes | Branches of Faith |
| 10 | [3138](https://hadeethenc.com/en/browse/hadith/3138) | Hasten to deeds before being overtaken by tribulations that are like patches of the darkest night; | Narrated by Muslim | 12/13 | yes | Branches of Faith |
| 11 | [3438](https://hadeethenc.com/en/browse/hadith/3438) | The Prophet (may Allah's peace and blessings be upon him) said about the Ansār (Supporters): "No one loves them except a believer, and no one hates them except a hypocrite. Allah loves whoever loves them and hates whoever hates them | Agreed upon | 13/13 | yes | Branches of Faith |
| 12 | [65031](https://hadeethenc.com/en/browse/hadith/65031) | I will be at the Cistern so that I see who among you will come to me. But some people will be barred from reaching me. Thereupon, I will say: 'O Lord, they belong to me and my Ummah | Agreed upon | 13/13 | yes | Branches of Faith |
| 13 | [3276](https://hadeethenc.com/en/browse/hadith/3276) | Faith has over seventy branches or over sixty branches, the most excellent of which is the declaration that there is no god but Allah, and the lowest of which is the removal of what is harmful from the path; and modesty is a branch of faith | Narrated by Bukhari & Muslim | 11/13 | — | Branches of Faith |
| 14 | [3330](https://hadeethenc.com/en/browse/hadith/3330) | May the curse of Allah be upon the Jews and the Christians, for they took the graves of their prophets as places of worship | Agreed upon | 13/13 | yes | Oneness of Allah's Worship |
| 15 | [3342](https://hadeethenc.com/en/browse/hadith/3342) | I am the One Who is most free from want of partners. So, he who does something for the sake of someone else beside Me, I discard him and his polytheism.' | Narrated by Muslim | 13/13 | yes | Oneness of Allah's Worship |
| 16 | [3406](https://hadeethenc.com/en/browse/hadith/3406) | Do not exaggerate in praising me as the Christians exaggerated in praising the son of Mary, for I am only His slave. So, call me the slave of Allah and His Messenger | Narrated by Al-Bukhāri | 13/13 | yes | Oneness of Allah's Worship |
| 17 | [3414](https://hadeethenc.com/en/browse/hadith/3414) | The happiest of people to receive my intercession on the Day of Judgment is the one who says, 'there is no god but Allah' sincerely from his heart or his soul | Narrated by Al-Bukhāri | 13/13 | yes | Oneness of Allah's Worship |
| 18 | [3419](https://hadeethenc.com/en/browse/hadith/3419) | Whoever dies while invoking besides Allah another equal will enter Hellfire | Agreed upon | 13/13 | yes | Oneness of Allah's Worship |
| 19 | [3420](https://hadeethenc.com/en/browse/hadith/3420) | Ruined are the extremists | Narrated by Muslim | 13/13 | yes | Oneness of Allah's Worship |
| 20 | [5934](https://hadeethenc.com/en/browse/hadith/5934) | Shall I not send you with the same instructions as the Messenger of Allah (may Allah's peace and blessings be upon him) sent me with? Do not leave any statue without blotting it out or any raised grave without leveling it | Narrated by Muslim | 13/13 | yes | Oneness of Allah's Worship |
| 21 | [4319](https://hadeethenc.com/en/browse/hadith/4319) | Verily, Allah has enjoined kindness in all things | Narrated by Muslim | 13/13 | yes | Praiseworthy Morals |
| 22 | [3716](https://hadeethenc.com/en/browse/hadith/3716) | May Allah have mercy on a man who is lenient when he sells, when he buys, and when he asks for repayment of the debt | Narrated by Al-Bukhāri | 13/13 | yes | Praiseworthy Morals |
| 23 | [3753](https://hadeethenc.com/en/browse/hadith/3753) | There was a man who used to give loans to people. He would say to his servant: ‘When you come to an insolvent person, overlook his debt; perhaps Allah would overlook our sins.’ | Agreed upon | 13/13 | yes | Praiseworthy Morals |
| 24 | [4709](https://hadeethenc.com/en/browse/hadith/4709) | Do not get angry | Narrated by Al-Bukhāri | 13/13 | yes | Praiseworthy Morals |
| 25 | [4935](https://hadeethenc.com/en/browse/hadith/4935) | Those who act justly will be with Allah on pulpits of light at the right Hand of the Most Compassionate, Exalted be He, and both His Hands are right | Narrated by Muslim | 13/13 | yes | Praiseworthy Morals |

## Everyday worship

*Starting out* · `daily` · today: **61** hadith in English · pass rules 2–3: **32** · shortlisted: **25** (8 in all thirteen languages, 12 in Swedish)

| # | HadeethEnc | Hadith | Reported by | Languages | Sv | Branch |
|---:|---|---|---|---:|:-:|---|
| 1 | [6274](https://hadeethenc.com/en/browse/hadith/6274) | Whoever recites the last two verses of Sūrat al-Baqarah at a night, they will suffice him | Agreed upon | 13/13 | yes | Morning and Evening Dhikr |
| 2 | [5475](https://hadeethenc.com/en/browse/hadith/5475) | The most beloved speech to Allah are four: subhān Allah (glory be Allah), al-hamdulillāh (praise be to Allah), la ilāha illa Allah (there is no god but Allah), and Allāhu akbar (Allah is the Most Great), and it does not matter which one of them you start with | Narrated by Muslim | 13/13 | yes | Timeless Dhikr |
| 3 | [5507](https://hadeethenc.com/en/browse/hadith/5507) | There are two words that are light on the tongue, heavy on the scale, and dear to the Most Merciful | Agreed upon | 13/13 | yes | Timeless Dhikr |
| 4 | [6211](https://hadeethenc.com/en/browse/hadith/6211) | To say 'subhān Allah wa al-hamdulillāh wa lā ilāha illa Allah wa Allāhu akbar (Glory be to Allah, praise be to Allah, there is no god but Allah, and Allah is the Most Great)' is more beloved to me than everything upon which the sun rises | Narrated by Muslim | 13/13 | yes | Timeless Dhikr |
| 5 | [3037](https://hadeethenc.com/en/browse/hadith/3037) | When one mentions Allah's name upon entering his house and upon eating, the devil says (to his companions): 'There is no night shelter nor supper here for you | Narrated by Muslim | 12/13 | yes | Dhikr on Entering and Leaving the House |
| 6 | [65092](https://hadeethenc.com/en/browse/hadith/65092) | When any of you enters the mosque, let him say: 'Allahumma iftah li abwāba rahmatik' (O Allah, open for me the gates of Your mercy). And when he leaves, let him say: 'Allahumma inni as’aluka min fadlik' (O Allah, I ask You of Your bounty) | Narrated by Muslim | 12/13 | yes | Dhikr on Entering and Leaving the Mosque |
| 7 | [3079](https://hadeethenc.com/en/browse/hadith/3079) | None of you should hold his penis with his right hand while urinating, nor wipe himself after answering the call of nature using his right hand, nor breathe into the vessel | Agreed upon | 12/13 | yes | Manners of Eating and Drinking |
| 8 | [2952](https://hadeethenc.com/en/browse/hadith/2952) | Every drink that intoxicates is unlawful. | Narrated by Bukhari & Muslim | 11/13 | — | Manners of Eating and Drinking |
| 9 | [4294](https://hadeethenc.com/en/browse/hadith/4294) | This man followed us. If you wish, allow him to come in, and if you wish, he will go back | Narrated by Bukhari & Muslim | 11/13 | — | Manners of Eating and Drinking |
| 10 | [4298](https://hadeethenc.com/en/browse/hadith/4298) | I saw the Messenger of Allah (may Allah's peace and blessings be upon him) eating with three fingers, and when he finished eating, he would lick them | Narrated by Muslim | 11/13 | — | Manners of Eating and Drinking |
| 11 | [5798](https://hadeethenc.com/en/browse/hadith/5798) | Allah is pleased with one who eats some food and praises Him for it, or drinks some drink and praises Him for it | Narrated by Muslim | 13/13 | yes | Manners of Eating and Drinking |
| 12 | [58120](https://hadeethenc.com/en/browse/hadith/58120) | O boy, mention Allah's name, eat with your right hand, and eat from what is nearer to you | Agreed upon | 13/13 | yes | Manners of Eating and Drinking |
| 13 | [58122](https://hadeethenc.com/en/browse/hadith/58122) | If anyone of you eats, let him eat with his right hand, and if he drinks, let him drink with his right hand, for indeed the devil eats with his left hand and drinks with his left hand | Narrated by Muslim | 12/13 | yes | Manners of Eating and Drinking |
| 14 | [3372](https://hadeethenc.com/en/browse/hadith/3372) | A man ate with his left hand in the presence of the Messenger of Allah (may Allah's peace and blessings be upon him), whereupon he said: "Eat with your right hand." The man said: I cannot do that. Thereupon, he said: "May you not be able to do that | Narrated by Muslim | 13/13 | yes | Manners of Eating and Drinking |
| 15 | [4966](https://hadeethenc.com/en/browse/hadith/4966) | The Messenger of Allah (may Allah's peace and blessings be upon him) never found fault with any food. If he liked it, he would eat; and if he disliked it, he would leave it | Narrated by Bukhari & Muslim | 11/13 | — | Manners of Eating and Drinking |
| 16 | [2935](https://hadeethenc.com/en/browse/hadith/2935) | When anyone of you eats food, let him not wipe his hand until he licks it or has it licked. | Narrated by Bukhari & Muslim | 11/13 | — | Manners of Eating and Drinking |
| 17 | [4219](https://hadeethenc.com/en/browse/hadith/4219) | Do not take two at a time, for indeed the Messenger of Allah (may Allah's peace and blessings be upon him) forbade taking two at a time. Then he said: Unless one asks for his brother's permission | Narrated by Bukhari & Muslim | 11/13 | — | Manners of Eating and Drinking |
| 18 | [5349](https://hadeethenc.com/en/browse/hadith/5349) | No one of you should drink while standing | Narrated by Muslim | 11/13 | — | Manners of Eating and Drinking |
| 19 | [5450](https://hadeethenc.com/en/browse/hadith/5450) | None of you should drink while standing, and whoever forgets, then let him induce vomit | Muslim with its two versions | 11/13 | — | Manners of Eating and Drinking |
| 20 | [5451](https://hadeethenc.com/en/browse/hadith/5451) | The Messenger of Allah (may Allah's peace and blessings be upon him) prohibited drinking directly from the mouth of a waterskin | Narrated by Bukhari - Narrated by Bukhari & Muslim | 11/13 | — | Manners of Eating and Drinking |
| 21 | [5452](https://hadeethenc.com/en/browse/hadith/5452) | The Messenger of Allah (may Allah's peace and blessings be upon him) forbade turning the waterskins upside down and drinking from their mouths | Narrated by Bukhari & Muslim | 11/13 | — | Manners of Eating and Drinking |
| 22 | [3021](https://hadeethenc.com/en/browse/hadith/3021) | O Messenger of Allah, may anyone of us sleep while being ritually impure? He said: Yes, he may sleep if he makes ablution | Narrated by Bukhari & Muslim | 11/13 | — | Manners of Sleeping and Waking Up |
| 23 | [8930](https://hadeethenc.com/en/browse/hadith/8930) | Do not keep the fire burning in your homes when you go to bed | Narrated by Bukhari & Muslim | 11/13 | — | Manners of Sleeping and Waking Up |
| 24 | [65060](https://hadeethenc.com/en/browse/hadith/65060) | When the Prophet (may Allah’s peace and blessings be upon him) went to bed every night, he would join his palms together and blow into them and recite the Surahs al-Ikhlās, al-Falaq, and an-Nās, | Narrated by Al-Bukhāri | 13/13 | yes | Manners of Sleeping and Waking Up |
| 25 | [4235](https://hadeethenc.com/en/browse/hadith/4235) | This fire is your enemy, so put it out before going to bed | Narrated by Bukhari & Muslim | 11/13 | — | Manners of Sleeping and Waking Up |

## Character and manners

*Building familiarity* · `manners` · today: **192** hadith in English · pass rules 2–3: **116** · shortlisted: **25** (12 in all thirteen languages, 25 in Swedish)

| # | HadeethEnc | Hadith | Reported by | Languages | Sv | Branch |
|---:|---|---|---|---:|:-:|---|
| 1 | [5365](https://hadeethenc.com/en/browse/hadith/5365) | It is unlawful for a Muslim to desert his fellow Muslim for more than three nights. As they meet, both of them turn their backs on each other. But the best of them is the one who starts by greeting the other | Agreed upon | 13/13 | yes | Shariah-approved Manners |
| 2 | [10101](https://hadeethenc.com/en/browse/hadith/10101) | A Muslim is the one from whose tongue and hand Muslims are safe, and a Muhājir (emigrant) is the one who abandons what Allah has forbidden | Agreed upon | 12/13 | yes | Shariah-approved Manners |
| 3 | [65124](https://hadeethenc.com/en/browse/hadith/65124) | “There are four (traits); whoever has them is a sheer hypocrite, and whoever has one trait of them has one of the traits of hypocrisy until he gives it up: whenever he speaks, he tells a lie; whenever he makes a covenant, he proves treacherous; whenever he makes a promise, he breaks it; and whenever he is in a dispute, he behaves in a shameless immoral manner | Agreed upon | 13/13 | yes | Shariah-approved Manners |
| 4 | [5343](https://hadeethenc.com/en/browse/hadith/5343) | The Muslim's right over his fellow Muslim is six." It was said: What are they, O Messenger of Allah? He said: "When you meet him, greet him with peace; when he invites you, accept his invitation; when he seeks your advice, advise him; when he sneezes and praises Allah, say Tasmīt to him; when he falls sick, visit him; and when he dies, follow him | Narrated by Muslim | 12/13 | yes | Shariah-approved Manners |
| 5 | [3014](https://hadeethenc.com/en/browse/hadith/3014) | Leave them, for I had put them on when they were in the state of purity | Agreed upon | 13/13 | yes | Shariah-approved Manners |
| 6 | [3079](https://hadeethenc.com/en/browse/hadith/3079) | None of you should hold his penis with his right hand while urinating, nor wipe himself after answering the call of nature using his right hand, nor breathe into the vessel | Agreed upon | 12/13 | yes | Shariah-approved Manners |
| 7 | [4521](https://hadeethenc.com/en/browse/hadith/4521) | It is not lawful for a Muslim woman to travel the distance of one night unless accompanied by a man who is a Mahram (non-marriageable male relative) to her | Agreed upon | 12/13 | yes | Shariah-approved Manners |
| 8 | [3706](https://hadeethenc.com/en/browse/hadith/3706) | A Muslim owes another Muslim five rights: returning the greeting of peace, visiting the sick, following the funeral processions, accepting invitations, and saying tashmīt (yarhamuk Allah) (may Allah show mercy to you) to the person who sneezes | Agreed upon | 13/13 | yes | Shariah-approved Manners |
| 9 | [5326](https://hadeethenc.com/en/browse/hadith/5326) | Do you know what backbiting is?" They said: "Allah and His Messenger know best." He said: "It is to say of your brother what he dislikes | Narrated by Muslim | 13/13 | yes | Shariah-approved Manners |
| 10 | [5733](https://hadeethenc.com/en/browse/hadith/5733) | The Prophet (may Allah's peace and blessings be upon him) would not refuse a gift of perfume | Narrated by Al-Bukhāri | 13/13 | yes | Shariah-approved Manners |
| 11 | [5798](https://hadeethenc.com/en/browse/hadith/5798) | Allah is pleased with one who eats some food and praises Him for it, or drinks some drink and praises Him for it | Narrated by Muslim | 13/13 | yes | Shariah-approved Manners |
| 12 | [58120](https://hadeethenc.com/en/browse/hadith/58120) | O boy, mention Allah's name, eat with your right hand, and eat from what is nearer to you | Agreed upon | 13/13 | yes | Shariah-approved Manners |
| 13 | [58122](https://hadeethenc.com/en/browse/hadith/58122) | If anyone of you eats, let him eat with his right hand, and if he drinks, let him drink with his right hand, for indeed the devil eats with his left hand and drinks with his left hand | Narrated by Muslim | 12/13 | yes | Shariah-approved Manners |
| 14 | [2985](https://hadeethenc.com/en/browse/hadith/2985) | Do not wear silk or brocade, and do not drink from gold or silver vessels, and do not eat in platters made therefrom, for they are for them in this world and for us in the Hereafter | Agreed upon | 12/13 | yes | Shariah-approved Manners |
| 15 | [2986](https://hadeethenc.com/en/browse/hadith/2986) | Whoever wears silk in the life of this world will not wear it in the Hereafter | Agreed upon | 12/13 | yes | Shariah-approved Manners |
| 16 | [3285](https://hadeethenc.com/en/browse/hadith/3285) | If any of you sees a vision he likes, it is from Allah. So, let him praise Allah for it, and let him recount it. If he sees something else that he dislikes, it is from the devil. So, let him seek refuge from its evil and mention it to no one, for it will not harm him | Narrated by Al-Bukhāri | 12/13 | yes | Shariah-approved Manners |
| 17 | [3372](https://hadeethenc.com/en/browse/hadith/3372) | A man ate with his left hand in the presence of the Messenger of Allah (may Allah's peace and blessings be upon him), whereupon he said: "Eat with your right hand." The man said: I cannot do that. Thereupon, he said: "May you not be able to do that | Narrated by Muslim | 13/13 | yes | Shariah-approved Manners |
| 18 | [3586](https://hadeethenc.com/en/browse/hadith/3586) | The good vision is from Allah, and the dream is from the devil. So, if any of you has a dream of which he is afraid, let him spit on his left and seek refuge with Allah from its evil, for it will not harm him | Agreed upon | 12/13 | yes | Shariah-approved Manners |
| 19 | [3689](https://hadeethenc.com/en/browse/hadith/3689) | Direct me to a deed that will make me enter Paradise if I do it. He said: "Worship Allah and do not associate anything with Him, establish the prescribed prayer, pay the obligatory Zakah, and fast Ramadān | Agreed upon | 13/13 | yes | Shariah-approved Manners |
| 20 | [4243](https://hadeethenc.com/en/browse/hadith/4243) | The one who is riding should greet the one walking, the one who is walking should greet the one sitting, and the small group of people should greet the large one | Agreed upon | 12/13 | yes | Shariah-approved Manners |
| 21 | [5347](https://hadeethenc.com/en/browse/hadith/5347) | Do not initiate the greeting of peace to the Jews or Christians, and if you meet one of them on the way, force him to narrowest part thereof | Narrated by Muslim | 12/13 | yes | Shariah-approved Manners |
| 22 | [5808](https://hadeethenc.com/en/browse/hadith/5808) | A man asked the Prophet (may Allah's peace and blessings be upon him): Which deed in Islam is the best? He said: "Feeding people and extending the greeting of peace to those you know and those you do not know | Agreed upon | 13/13 | yes | Shariah-approved Manners |
| 23 | [6379](https://hadeethenc.com/en/browse/hadith/6379) | Whoever swears by Al-Lāt and Al-‘Uzza should say: 'There is no god but Allah'. And whoever says to his companion 'Come and gamble with me' should give charity | Agreed upon | 12/13 | yes | Shariah-approved Manners |
| 24 | [8904](https://hadeethenc.com/en/browse/hadith/8904) | A man must not look at another man's ‘Awrah (must-cover body part), nor must a woman look at another woman's ‘Awrah | Narrated by Muslim | 12/13 | yes | Shariah-approved Manners |
| 25 | [65060](https://hadeethenc.com/en/browse/hadith/65060) | When the Prophet (may Allah’s peace and blessings be upon him) went to bed every night, he would join his palms together and blow into them and recite the Surahs al-Ikhlās, al-Falaq, and an-Nās, | Narrated by Al-Bukhāri | 13/13 | yes | Shariah-approved Manners |

## Purifying the heart

*Building familiarity* · `heart` · today: **73** hadith in English · pass rules 2–3: **27** · shortlisted: **25** (6 in all thirteen languages, 17 in Swedish)

| # | HadeethEnc | Hadith | Reported by | Languages | Sv | Branch |
|---:|---|---|---|---:|:-:|---|
| 1 | [3342](https://hadeethenc.com/en/browse/hadith/3342) | I am the One Who is most free from want of partners. So, he who does something for the sake of someone else beside Me, I discard him and his polytheism.' | Narrated by Muslim | 13/13 | yes | Acts of Heart |
| 2 | [4555](https://hadeethenc.com/en/browse/hadith/4555) | Indeed, Allah does not look at your appearance and wealth, but He looks at your hearts and deeds.” | Narrated by Muslim | 12/13 | yes | Acts of Heart |
| 3 | [3407](https://hadeethenc.com/en/browse/hadith/3407) | There is no contagion, nor is there any evil omen in birds, nor is there any evil omen in the owl, nor is there any evil omen in Safar, and run away from the leper as you would run away from the lion | Agreed upon | 12/13 | yes | Acts of Heart |
| 4 | [5493](https://hadeethenc.com/en/browse/hadith/5493) | The strong believer is better and dearer to Allah than the weak believer, and there is good in both | Narrated by Muslim | 12/13 | yes | Acts of Heart |
| 5 | [3157](https://hadeethenc.com/en/browse/hadith/3157) | Whoever sincerely asks Allah for martyrdom, Allah will make him reach the status of martyrs even if he dies on his bed | Narrated by Muslim | 12/13 | yes | Acts of Heart |
| 6 | [4304](https://hadeethenc.com/en/browse/hadith/4304) | When two Muslims meet to fight each other with their swords, both the killer and the killed are doomed to Hellfire | Agreed upon | 13/13 | yes | Acts of Heart |
| 7 | [5953](https://hadeethenc.com/en/browse/hadith/5953) | None of you truly believes until I become dearer to him than his father, his children, and all people | Agreed upon | 12/13 | yes | Acts of Heart |
| 8 | [3779](https://hadeethenc.com/en/browse/hadith/3779) | Let none of you die except while having good expectations of Allah | Narrated by Muslim | 12/13 | yes | Acts of Heart |
| 9 | [4308](https://hadeethenc.com/en/browse/hadith/4308) | Righteousness is good morals, and sinfulness is what your heart is not at ease with, and you hate that people know about it | Narrated by Muslim | 13/13 | yes | Acts of Heart |
| 10 | [3055](https://hadeethenc.com/en/browse/hadith/3055) | Modesty brings nothing but good | Narrated by Muslim - Narrated by Bukhari & Muslim | 11/13 | — | Merits of Heart Acts |
| 11 | [8314](https://hadeethenc.com/en/browse/hadith/8314) | Allah says: If My slave intends to do an evil deed, do not write it down until he does it. If he does it, then write it as it is. If he does not do it for My Sake, then write it as a good deed for him | Narrated by Bukhari & Muslim | 11/13 | — | Merits of Heart Acts |
| 12 | [65114](https://hadeethenc.com/en/browse/hadith/65114) | Allah Almighty does not sleep, and it is not befitting of Him to sleep | Narrated by Muslim | 8/13 | — | Repentance |
| 13 | [4318](https://hadeethenc.com/en/browse/hadith/4318) | Verily, Allah Almighty extends His Hand during the night so the sinner of the day may repent, and He extends His Hand during the day so the sinner of the night may repent until the sun rises from its west | Narrated by Muslim | 12/13 | yes | Repentance |
| 14 | [4797](https://hadeethenc.com/en/browse/hadith/4797) | Whoever repents before the sun rises from the west, Allah will accept his repentance | Narrated by Muslim | 11/13 | — | Repentance |
| 15 | [3656](https://hadeethenc.com/en/browse/hadith/3656) | A man kissed a woman (unlawfully), so he came to the Prophet (may Allah's peace and blessings be upon him) and told him of what he did. So Allah, the Almighty, revealed the verse: {And establish prayer at the two ends of the day and at the approach of the night. Indeed, good deeds do away with misdeeds.} [Sūrat Hūd: 114] | Narrated by Bukhari & Muslim | 11/13 | — | Repentance |
| 16 | [3658](https://hadeethenc.com/en/browse/hadith/3658) | A man came to the Prophet (may Allah's peace and blessings be upon him) and said: O Messenger of Allah, I committed a sin liable to a legal punishment, so inflict it upon me | Narrated by Bukhari & Muslim | 11/13 | — | Repentance |
| 17 | [65004](https://hadeethenc.com/en/browse/hadith/65004) | Purity is half of faith, al-hamdulillāh (praise be to Allah) fills the Scale, and subhān Allah wa al-hamdulillāh (glory and praise be to Allah) fills what is between the heavens and the earth | Narrated by Muslim | 13/13 | yes | Purification of Souls |
| 18 | [65018](https://hadeethenc.com/en/browse/hadith/65018) | tell me something about Islam regarding which I can ask none but you. He (may Allah's peace and blessings be upon him) said: "Say: I believe in Allah, then remain steadfast | Narrated by Muslim and Ahmad | 13/13 | yes | Purification of Souls |
| 19 | [65022](https://hadeethenc.com/en/browse/hadith/65022) | The Hour will not be established until a man would pass by the grave of another man and say: 'I wish I were in his place.' | Agreed upon | 12/13 | yes | Purification of Souls |
| 20 | [66526](https://hadeethenc.com/en/browse/hadith/66526) | Purity is half of faith, al-hamdulillāh (praise be to Allah) fills the Scale, and subhānallāh wa al-hamdulillāh (glory and praise be to Allah) fills what is between the heavens and the earth | Narrated by Muslim | 12/13 | — | Purification of Souls |
| 21 | [3298](https://hadeethenc.com/en/browse/hadith/3298) | How astonishing the believer's affair is! Indeed, all of his affairs are good, and this is for none but the believer | Narrated by Muslim | 12/13 | yes | Purification of Souls |
| 22 | [4704](https://hadeethenc.com/en/browse/hadith/4704) | Be in this world as if you are a stranger or a wayfarer | Narrated by Al-Bukhāri | 13/13 | yes | Purification of Souls |
| 23 | [3300](https://hadeethenc.com/en/browse/hadith/3300) | You indulge in such actions that are less significant in your eyes than a hair, while we used to consider them destructive sins during the Prophet’s lifetime | Narrated by Bukhari | 11/13 | — | Purification of Souls |
| 24 | [8902](https://hadeethenc.com/en/browse/hadith/8902) | I asked the Messenger of Allah (may Allah's peace and blessings be upon him) about the sudden glance, and he commanded me to avert my gaze | Narrated by Muslim | 12/13 | yes | Purification of Souls |
| 25 | [5449](https://hadeethenc.com/en/browse/hadith/5449) | There are two blessings in which many people incur loss: health and free time | Narrated by Al-Bukhāri | 12/13 | yes | Purification of Souls |

## Family and neighbours

> Only 4 of this topic are reported by al-Bukhārī or Muslim: rule 2 is dropped for this set.

*Building familiarity* · `family` · today: **12** hadith in English · pass rules 2–3: **7** · shortlisted: **7** (1 in all thirteen languages, 4 in Swedish)

> Thin: only 7 pass the rules. This set needs hadith from outside its present topics, or the rules relaxed for it.

| # | HadeethEnc | Hadith | Reported by | Languages | Sv | Branch |
|---:|---|---|---|---:|:-:|---|
| 1 | [3718](https://hadeethenc.com/en/browse/hadith/3718) | May his nose be rubbed in dust, then may his nose be rubbed in dust, and may his nose be rubbed in dust." It was said: "O Messenger of Allah, who? He said: "The one whose parents, one of them or both, reach old age in his life yet he does not enter Paradise | Narrated by Muslim | 12/13 | yes | Merits of Being Dutiful to One's Parents |
| 2 | [64599](https://hadeethenc.com/en/browse/hadith/64599) | Go back to them and seek their permission. If they give you permission, you can engage in Jihad, otherwise, be dutiful to them | Narrated by Abu Daoud | 8/13 | — | Merits of Being Dutiful to One's Parents |
| 3 | [5361](https://hadeethenc.com/en/browse/hadith/5361) | The pleasure of Allah is in the pleasure of the parents, and the displeasure of Allah is in the displeasure of the parents | Narrated by At-Termedhy | 11/13 | — | Merits of Being Dutiful to One's Parents |
| 4 | [3775](https://hadeethenc.com/en/browse/hadith/3775) | No son can repay the kindness of his father unless he finds him a slave and buys him and emancipates him | Narrated by Muslim | 11/13 | — | Merits of Being Dutiful to One's Parents |
| 5 | [58188](https://hadeethenc.com/en/browse/hadith/58188) | I said: O Messenger of Allah, to whom should I be dutiful? he said: "Your mother, then your mother, then your mother, then your father, then the next in nearness and so on | Narrated by Abu Dāwūd, At-Tirmidhi, and Ahmad | 10/13 | yes | Merits of Being Dutiful to One's Parents |
| 6 | [5367](https://hadeethenc.com/en/browse/hadith/5367) | The one who severs the ties of kinship will not enter Paradise | Agreed upon | 13/13 | yes | Merits of Maintaining Kinship Ties |
| 7 | [3863](https://hadeethenc.com/en/browse/hadith/3863) | If you are as you say, then it is as if you are feeding them hot ashes, and you will continue to have a supporter against them from Allah as long as you continue to do this | Narrated by Muslim | 12/13 | yes | Merits of Maintaining Kinship Ties |

## Virtues of deeds

*Building familiarity* · `virtues` · today: **58** hadith in English · pass rules 2–3: **30** · shortlisted: **25** (7 in all thirteen languages, 14 in Swedish)

| # | HadeethEnc | Hadith | Reported by | Languages | Sv | Branch |
|---:|---|---|---|---:|:-:|---|
| 1 | [10416](https://hadeethenc.com/en/browse/hadith/10416) | Allah has ninety-nine names – one hundred minus one – and no one memorizes them but that they will enter Paradise. He is One, and He loves odd numbers | Narrated by Bukhari & Muslim | 11/13 | — | Merits of Good Deeds |
| 2 | [6461](https://hadeethenc.com/en/browse/hadith/6461) | If the slave draws closer to Me by a hand-span, I shall draw closer to him by a cubit; and if he draws closer to Me by a cubit, I shall draw closer to him by the span of two outstretched arms. If he comes to Me walking, I shall come to him running | Narrated by Bukhari - Narrated by Bukhari & Muslim | 11/13 | — | Merits of Good Deeds |
| 3 | [3591](https://hadeethenc.com/en/browse/hadith/3591) | The five (daily) prayers, Friday prayer to the next Friday prayer, and Ramadan to the next Ramadan are expiation of the sins committed between them, so long as major sins are avoided | Narrated by Muslim | 13/13 | yes | Merits of Good Deeds |
| 4 | [3365](https://hadeethenc.com/en/browse/hadith/3365) | Which deed is dearest to Allah? He said: "Offering prayer at its earliest appointed time." I said: Then, what comes next? He said: "Dutifulness to one's parents." I said: Then, what comes next? He said: "Jihad in the way of Allah | Agreed upon | 13/13 | yes | Merits of Good Deeds |
| 5 | [2967](https://hadeethenc.com/en/browse/hadith/2967) | Observing Ribāt (guarding the Muslims' frontiers) for one day in the cause of Allah is better than the world and everything in it | Agreed upon | 10/13 | — | Merits of Good Deeds |
| 6 | [2979](https://hadeethenc.com/en/browse/hadith/2979) | Keep some of your wealth, for this is better for you | Narrated by Bukhari & Muslim | 10/13 | — | Merits of Good Deeds |
| 7 | [5346](https://hadeethenc.com/en/browse/hadith/5346) | Every act of goodness is charity | Narrated by Al-Bukhāri via Jābir and by Muslim via Hudhayfah | 13/13 | yes | Merits of Good Deeds |
| 8 | [5372](https://hadeethenc.com/en/browse/hadith/5372) | Whoever loves to have his sustenance expanded and his term of life prolonged should maintain his kinship ties | Agreed upon | 13/13 | yes | Merits of Good Deeds |
| 9 | [3162](https://hadeethenc.com/en/browse/hadith/3162) | Allah, the Exalted, says: "My reward shall be nothing less than Paradise for My faithful servant who, if I take the life of his beloved one from the inhabitants of the world, he bears it patiently in expectation of My reward." | Narrated by Bukhari | 11/13 | — | Merits of Good Deeds |
| 10 | [3267](https://hadeethenc.com/en/browse/hadith/3267) | The best dinar a man spends is a dinar that he spends on his dependents, and a dinar that a man spends on his mount in the cause of Allah, and a dinar that he spends on his companions in the cause of Allah | Narrated by Muslim | 12/13 | yes | Merits of Good Deeds |
| 11 | [3360](https://hadeethenc.com/en/browse/hadith/3360) | Whoever provides for two girls until they reach puberty, he will come on the Day of Judgment, me and him," and he joined his fingers | Narrated by Muslim | 12/13 | yes | Merits of Good Deeds |
| 12 | [3574](https://hadeethenc.com/en/browse/hadith/3574) | Shall I not guide you to what Allah erases the sins and elevates the ranks with? | Narrated by Muslim | 12/13 | yes | Merits of Good Deeds |
| 13 | [3558](https://hadeethenc.com/en/browse/hadith/3558) | There are forty good qualities, the best of which is the lending of a milch goat. Anyone carries out any of these virtuous deeds seeking its reward (from Allah) with firm confidence that he will receive it, Allah will admit him to Paradise | Narrated by Bukhari | 11/13 | — | Merits of Good Deeds |
| 14 | [8900](https://hadeethenc.com/en/browse/hadith/8900) | What do you think of a man who does a good deed and people praise him for it? He said: That is instant good news for the believer | Narrated by Muslim | 11/13 | — | Merits of Good Deeds |
| 15 | [3592](https://hadeethenc.com/en/browse/hadith/3592) | Worship during times of turmoil is like emigration to me | Narrated by Muslim | 11/13 | — | Merits of Good Deeds |
| 16 | [5020](https://hadeethenc.com/en/browse/hadith/5020) | Worship at times of chaos is like emigration to me | Narrated by Muslim | 12/13 | yes | Merits of Good Deeds |
| 17 | [65087](https://hadeethenc.com/en/browse/hadith/65087) | When you hear the Muezzin, say what he says and then invoke Allah's blessings upon me | Narrated by Muslim | 12/13 | yes | Merits of Remembering Allah |
| 18 | [65105](https://hadeethenc.com/en/browse/hadith/65105) | That is Satan who is known as Khinzab. If you perceive his effect, seek refuge with Allah from him and spit three times to your left | Narrated by Muslim | 13/13 | yes | Merits of Remembering Allah |
| 19 | [5516](https://hadeethenc.com/en/browse/hadith/5516) | Whoever says ‘subhān Allah wa bihamdih (glory be to Allah, and praise be to Him)’ one hundred times a day, his sins will be erased, even if they were as much as the foam of the sea | Agreed upon | 13/13 | yes | Merits of Remembering Allah |
| 20 | [5517](https://hadeethenc.com/en/browse/hadith/5517) | Whoever says ten times | Agreed upon | 13/13 | yes | Merits of Remembering Allah |
| 21 | [3719](https://hadeethenc.com/en/browse/hadith/3719) | Al-Mufarridūn have gone far ahead | Narrated by Muslim | 12/13 | yes | Merits of Remembering Allah |
| 22 | [5402](https://hadeethenc.com/en/browse/hadith/5402) | Shall I inform you about the most beloved words by Allah? They are: Glory belongs to Allah and praise is due to Him | Narrated by Muslim | 11/13 | — | Merits of Remembering Allah |
| 23 | [5454](https://hadeethenc.com/en/browse/hadith/5454) | By the One in Whose hand my soul is, if you were not to commit sins, Allah would replace you with people who would commit sins and then seek forgiveness from Allah, the Almighty, who would then forgive them | Narrated by Muslim | 11/13 | — | Merits of Remembering Allah |
| 24 | [6218](https://hadeethenc.com/en/browse/hadith/6218) | Allah does not listen as attentively to anything as He listens to a prophet with a melodious voice | Narrated by Bukhari & Muslim | 11/13 | — | Merits of Remembering Allah |
| 25 | [4809](https://hadeethenc.com/en/browse/hadith/4809) | O people, repent to Allah, for I repent to Him one hundred times a day | Narrated by Muslim | 12/13 | yes | Merits of Remembering Allah |

## Creed

*In depth* · `creed` · today: **471** hadith in English · pass rules 2–3: **221** · shortlisted: **40** (40 in all thirteen languages, 40 in Swedish)

| # | HadeethEnc | Hadith | Reported by | Languages | Sv | Branch |
|---:|---|---|---|---:|:-:|---|
| 1 | [3330](https://hadeethenc.com/en/browse/hadith/3330) | May the curse of Allah be upon the Jews and the Christians, for they took the graves of their prophets as places of worship | Agreed upon | 13/13 | yes | The Creed |
| 2 | [3342](https://hadeethenc.com/en/browse/hadith/3342) | I am the One Who is most free from want of partners. So, he who does something for the sake of someone else beside Me, I discard him and his polytheism.' | Narrated by Muslim | 13/13 | yes | The Creed |
| 3 | [3406](https://hadeethenc.com/en/browse/hadith/3406) | Do not exaggerate in praising me as the Christians exaggerated in praising the son of Mary, for I am only His slave. So, call me the slave of Allah and His Messenger | Narrated by Al-Bukhāri | 13/13 | yes | The Creed |
| 4 | [3414](https://hadeethenc.com/en/browse/hadith/3414) | The happiest of people to receive my intercession on the Day of Judgment is the one who says, 'there is no god but Allah' sincerely from his heart or his soul | Narrated by Al-Bukhāri | 13/13 | yes | The Creed |
| 5 | [3418](https://hadeethenc.com/en/browse/hadith/3418) | Whoever meets Allah without associating partners with Him will enter Paradise, and whoever meets Him while associating partners with Him will enter Hellfire | Narrated by Muslim | 13/13 | yes | The Creed |
| 6 | [3419](https://hadeethenc.com/en/browse/hadith/3419) | Whoever dies while invoking besides Allah another equal will enter Hellfire | Agreed upon | 13/13 | yes | The Creed |
| 7 | [3420](https://hadeethenc.com/en/browse/hadith/3420) | Ruined are the extremists | Narrated by Muslim | 13/13 | yes | The Creed |
| 8 | [4204](https://hadeethenc.com/en/browse/hadith/4204) | If Allah wills good for someone, He makes him suffer from afflictions | Narrated by Al-Bukhāri | 13/13 | yes | The Creed |
| 9 | [4295](https://hadeethenc.com/en/browse/hadith/4295) | Leave me as I leave you. Verily, what destroyed those before you was their asking questions and their disagreement with their prophets | Agreed upon | 13/13 | yes | The Creed |
| 10 | [4792](https://hadeethenc.com/en/browse/hadith/4792) | Whoever introduces into this matter of ours (Islam) something that does not belong to it shall have it rejected | Agreed upon | 13/13 | yes | The Creed |
| 11 | [4947](https://hadeethenc.com/en/browse/hadith/4947) | Everyone of my Ummah will enter Paradise except those who refuse | Narrated by Al-Bukhāri | 13/13 | yes | The Creed |
| 12 | [5359](https://hadeethenc.com/en/browse/hadith/5359) | I asked the Prophet (may Allah's peace and blessings be upon him): "Which sin is the gravest in the sight of Allah?" He said: "To set an equal to Allah while He created you | Agreed upon | 13/13 | yes | The Creed |
| 13 | [5365](https://hadeethenc.com/en/browse/hadith/5365) | It is unlawful for a Muslim to desert his fellow Muslim for more than three nights. As they meet, both of them turn their backs on each other. But the best of them is the one who starts by greeting the other | Agreed upon | 13/13 | yes | The Creed |
| 14 | [5657](https://hadeethenc.com/en/browse/hadith/5657) | You will see your Lord as you see this moon, you will not have any difficulty in seeing Him | Agreed upon | 13/13 | yes | The Creed |
| 15 | [5811](https://hadeethenc.com/en/browse/hadith/5811) | Verily, Allah gives respite to the oppressor, but when He seizes him, He does not release him | Agreed upon | 13/13 | yes | The Creed |
| 16 | [5934](https://hadeethenc.com/en/browse/hadith/5934) | Shall I not send you with the same instructions as the Messenger of Allah (may Allah's peace and blessings be upon him) sent me with? Do not leave any statue without blotting it out or any raised grave without leveling it | Narrated by Muslim | 13/13 | yes | The Creed |
| 17 | [5986](https://hadeethenc.com/en/browse/hadith/5986) | Whoever goes to a soothsayer and asks him about something and believes him, his prayer will not be accepted for forty nights | Narrated by Muslim | 13/13 | yes | The Creed |
| 18 | [6468](https://hadeethenc.com/en/browse/hadith/6468) | Faith has over seventy branches - or over sixty branches - the most excellent of which is the declaration that 'lā ilāha illa Allah (there is no god but Allah)', and the lowest of which is the removal of what is harmful from the way | Agreed upon | 13/13 | yes | The Creed |
| 19 | [6761](https://hadeethenc.com/en/browse/hadith/6761) | There should not remain any necklace of string or any other kind of necklace around the necks of camels without being cut | Agreed upon | 13/13 | yes | The Creed |
| 20 | [6765](https://hadeethenc.com/en/browse/hadith/6765) | Whoever says 'lā ilāha illa Allah (there is no god but Allah)' and disbelieves in everything worshiped besides Allah, his property and blood becomes inviolable, and his reckoning will be with Allah | Narrated by Muslim | 13/13 | yes | The Creed |
| 21 | [8918](https://hadeethenc.com/en/browse/hadith/8918) | That is a word pertaining to the truth which a jinn snatches and whispers into his friend's ears as a hen does. Then, they mix it with more than a hundred lies | Agreed upon | 13/13 | yes | The Creed |
| 22 | [10412](https://hadeethenc.com/en/browse/hadith/10412) | Our Lord, Glorified and Exalted, descends every night to the lowest heaven when the last third of the night remains | Agreed upon | 13/13 | yes | The Creed |
| 23 | [10647](https://hadeethenc.com/en/browse/hadith/10647) | Do not sit on graves, and do not pray towards them | Narrated by Muslim | 13/13 | yes | The Creed |
| 24 | [10887](https://hadeethenc.com/en/browse/hadith/10887) | Those are a people who, when a righteous slave or a righteous man from among them dies, they build a place of worship | Agreed upon | 13/13 | yes | The Creed |
| 25 | [65000](https://hadeethenc.com/en/browse/hadith/65000) | Islam is built on five | Agreed upon | 13/13 | yes | The Creed |
| 26 | [65001](https://hadeethenc.com/en/browse/hadith/65001) | Whoever of you sees something evil, let him change it with his hand; and if he is not able, then with his tongue; and if he is not able, then with his heart, and that is the weakest of faith | Narrated by Muslim | 13/13 | yes | The Creed |
| 27 | [65002](https://hadeethenc.com/en/browse/hadith/65002) | He who does good in Islam will not be punished for what he did during jāhiliyyah, and he who commits evil in Islam will be punished for the previous and later deeds | Agreed upon | 13/13 | yes | The Creed |
| 28 | [65003](https://hadeethenc.com/en/browse/hadith/65003) | Do you think that if I perform the obligatory payers, fast Ramadan, treat the lawful as lawful, and treat the unlawful as unlawful, | Narrated by Muslim | 13/13 | yes | The Creed |
| 29 | [65004](https://hadeethenc.com/en/browse/hadith/65004) | Purity is half of faith, al-hamdulillāh (praise be to Allah) fills the Scale, and subhān Allah wa al-hamdulillāh (glory and praise be to Allah) fills what is between the heavens and the earth | Narrated by Muslim | 13/13 | yes | The Creed |
| 30 | [65008](https://hadeethenc.com/en/browse/hadith/65008) | Whoever dies while not associating anything with Allah will enter Paradise, and whoever dies while associating anything with Allah will enter Hellfire | Narrated by Muslim | 13/13 | yes | The Creed |
| 31 | [65018](https://hadeethenc.com/en/browse/hadith/65018) | tell me something about Islam regarding which I can ask none but you. He (may Allah's peace and blessings be upon him) said: "Say: I believe in Allah, then remain steadfast | Narrated by Muslim and Ahmad | 13/13 | yes | The Creed |
| 32 | [65038](https://hadeethenc.com/en/browse/hadith/65038) | Allah decreed the destinies of the creatures fifty thousand years before He created the heavens and the earth | Narrated by Muslim | 13/13 | yes | The Creed |
| 33 | [2945](https://hadeethenc.com/en/browse/hadith/2945) | Indeed, Allah Almighty forbids you to swear by your forefathers | Agreed upon | 13/13 | yes | The Creed |
| 34 | [3010](https://hadeethenc.com/en/browse/hadith/3010) | They are being tormented, but they are not tormented for a major sin. One of them would not save himself from being soiled with his urine, while the other used to walk about spreading malicious gossip | Agreed upon | 13/13 | yes | The Creed |
| 35 | [3422](https://hadeethenc.com/en/browse/hadith/3422) | There is no transitive disease and no evil omen, and I like a good omen." It was said: What is a good omen? He said: "A good word | Agreed upon | 13/13 | yes | The Creed |
| 36 | [3438](https://hadeethenc.com/en/browse/hadith/3438) | The Prophet (may Allah's peace and blessings be upon him) said about the Ansār (Supporters): "No one loves them except a believer, and no one hates them except a hypocrite. Allah loves whoever loves them and hates whoever hates them | Agreed upon | 13/13 | yes | The Creed |
| 37 | [4211](https://hadeethenc.com/en/browse/hadith/4211) | I have been commanded to fight people until they testify that there is no god but Allah and that Muhammad is the Messenger of Allah, establish prayer, and pay Zakah | Agreed upon | 13/13 | yes | The Creed |
| 38 | [5931](https://hadeethenc.com/en/browse/hadith/5931) | the people who will receive the severest punishment on the Day of Judgment will be those who try to emulate Allah'sAllah's creation | Agreed upon | 13/13 | yes | The Creed |
| 39 | [6327](https://hadeethenc.com/en/browse/hadith/6327) | The son of Adam tells a lie against Me and he has no right to do so; and he insults Me and has no right to do so | Narrated by Al-Bukhāri | 13/13 | yes | The Creed |
| 40 | [65009](https://hadeethenc.com/en/browse/hadith/65009) | for he did not ever say: My Lord, forgive my sins on the Day of Judgment | Narrated by Muslim | 13/13 | yes | The Creed |

## Worship in detail

*In depth* · `worship` · today: **750** hadith in English · pass rules 2–3: **397** · shortlisted: **40** (37 in all thirteen languages, 40 in Swedish)

| # | HadeethEnc | Hadith | Reported by | Languages | Sv | Branch |
|---:|---|---|---|---:|:-:|---|
| 1 | [3366](https://hadeethenc.com/en/browse/hadith/3366) | The most burdensome prayers for the hypocrites are the ‘Ishā’ and Fajr prayers. If they were to know the virtue of them, they would come to them, even if they had to crawl | Agreed upon | 12/13 | yes | Jurisprudence of Acts of Worship |
| 2 | [10647](https://hadeethenc.com/en/browse/hadith/10647) | Do not sit on graves, and do not pray towards them | Narrated by Muslim | 13/13 | yes | Jurisprudence of Acts of Worship |
| 3 | [10887](https://hadeethenc.com/en/browse/hadith/10887) | Those are a people who, when a righteous slave or a righteous man from among them dies, they build a place of worship | Agreed upon | 13/13 | yes | Jurisprudence of Acts of Worship |
| 4 | [65000](https://hadeethenc.com/en/browse/hadith/65000) | Islam is built on five | Agreed upon | 13/13 | yes | Jurisprudence of Acts of Worship |
| 5 | [65003](https://hadeethenc.com/en/browse/hadith/65003) | Do you think that if I perform the obligatory payers, fast Ramadan, treat the lawful as lawful, and treat the unlawful as unlawful, | Narrated by Muslim | 13/13 | yes | Jurisprudence of Acts of Worship |
| 6 | [65004](https://hadeethenc.com/en/browse/hadith/65004) | Purity is half of faith, al-hamdulillāh (praise be to Allah) fills the Scale, and subhān Allah wa al-hamdulillāh (glory and praise be to Allah) fills what is between the heavens and the earth | Narrated by Muslim | 13/13 | yes | Jurisprudence of Acts of Worship |
| 7 | [65093](https://hadeethenc.com/en/browse/hadith/65093) | What stands between a man and polytheism and disbelief is the abandonment of the prayers | Narrated by Muslim | 12/13 | yes | Jurisprudence of Acts of Worship |
| 8 | [6615](https://hadeethenc.com/en/browse/hadith/6615) | There is none among you except that Allah will speak to him, with no interpreter between Him and him | Agreed upon | 12/13 | yes | Jurisprudence of Acts of Worship |
| 9 | [65105](https://hadeethenc.com/en/browse/hadith/65105) | That is Satan who is known as Khinzab. If you perceive his effect, seek refuge with Allah from him and spit three times to your left | Narrated by Muslim | 13/13 | yes | Jurisprudence of Acts of Worship |
| 10 | [2758](https://hadeethenc.com/en/browse/hadith/2758) | Whoever performs Hajj without engaging in rafath (sexual relations or obscene speech) or sinning will return like the day his mother gave birth to him | Agreed upon | 13/13 | yes | Jurisprudence of Acts of Worship |
| 11 | [3591](https://hadeethenc.com/en/browse/hadith/3591) | The five (daily) prayers, Friday prayer to the next Friday prayer, and Ramadan to the next Ramadan are expiation of the sins committed between them, so long as major sins are avoided | Narrated by Muslim | 13/13 | yes | Jurisprudence of Acts of Worship |
| 12 | [4196](https://hadeethenc.com/en/browse/hadith/4196) | Whoever fasts Ramadan, out of faith and in pursuit of reward, his past sins will be forgiven | Agreed upon | 13/13 | yes | Jurisprudence of Acts of Worship |
| 13 | [4202](https://hadeethenc.com/en/browse/hadith/4202) | Whoever performs Qiyām (night prayer) in the Night of Decree, out of faith and in pursuit of reward, his past sins will be forgiven | Agreed upon | 13/13 | yes | Jurisprudence of Acts of Worship |
| 14 | [5364](https://hadeethenc.com/en/browse/hadith/5364) | Do not curse the dead, for they have reached the result of what they have done | Narrated by Al-Bukhāri | 13/13 | yes | Jurisprudence of Acts of Worship |
| 15 | [5435](https://hadeethenc.com/en/browse/hadith/5435) | Whoever performs the Fajr prayer is under the protection of Allah | Narrated by Muslim | 13/13 | yes | Jurisprudence of Acts of Worship |
| 16 | [5512](https://hadeethenc.com/en/browse/hadith/5512) | Charity does not diminish wealth, and Allah does not increase a servant, on account of his forgiveness, except in honor, and no one humbles himself seeking the pleasure of Allah except that Allah will elevate him | Narrated by Muslim | 13/13 | yes | Jurisprudence of Acts of Worship |
| 17 | [5805](https://hadeethenc.com/en/browse/hadith/5805) | Allah said: 'O son of Adam, spend, and I will spend on you.' | Agreed upon | 13/13 | yes | Jurisprudence of Acts of Worship |
| 18 | [6255](https://hadeethenc.com/en/browse/hadith/6255) | There are no days in which righteous deeds are more beloved to Allah than on these days," referring to the first ten days of Dhul-Hijjah | Narrated by Al-Bukhāri and Abu Dāwūd, and this is the wording of Abu Dāwūd | 13/13 | yes | Jurisprudence of Acts of Worship |
| 19 | [6261](https://hadeethenc.com/en/browse/hadith/6261) | Whoever abandons the ‘Asr prayer, his deeds will be rendered worthless | Narrated by Al-Bukhāri | 13/13 | yes | Jurisprudence of Acts of Worship |
| 20 | [6263](https://hadeethenc.com/en/browse/hadith/6263) | Whoever performs ablution perfectly, his sins will come out from his body, to the extent that it will come out from under his nails | Narrated by Muslim | 13/13 | yes | Jurisprudence of Acts of Worship |
| 21 | [10947](https://hadeethenc.com/en/browse/hadith/10947) | Allahumma anta as-salām wa minka as-salām, tabārakta yadha al-jalāl wa al-ikrām | Narrated by Muslim | 13/13 | yes | Jurisprudence of Acts of Worship |
| 22 | [10951](https://hadeethenc.com/en/browse/hadith/10951) | Pray while standing; if you cannot, then while sitting; and if you cannot, then while lying on your side | Narrated by Al-Bukhāri | 13/13 | yes | Jurisprudence of Acts of Worship |
| 23 | [11287](https://hadeethenc.com/en/browse/hadith/11287) | Do you hear the Adhān?" He replied in the affirmative. Thereupon, he said: "Then respond to it | Narrated by Muslim | 13/13 | yes | Jurisprudence of Acts of Worship |
| 24 | [2969](https://hadeethenc.com/en/browse/hadith/2969) | Whoever fights so that the word of Allah be supreme is indeed in the cause of Allah | Agreed upon | 13/13 | yes | Jurisprudence of Acts of Worship |
| 25 | [3014](https://hadeethenc.com/en/browse/hadith/3014) | Leave them, for I had put them on when they were in the state of purity | Agreed upon | 13/13 | yes | Jurisprudence of Acts of Worship |
| 26 | [3095](https://hadeethenc.com/en/browse/hadith/3095) | The Messenger of Allah (may Allah's peace and blessings be upon him) used to raise his hands in line with his shoulders when commencing the prayer, | Agreed upon | 13/13 | yes | Jurisprudence of Acts of Worship |
| 27 | [3150](https://hadeethenc.com/en/browse/hadith/3150) | The Prophet (may Allah's peace and blessings be upon him) used to say before entering the bathroom: "Allāhumma inni a‘ūdhu bika min al-khubuth wa al-khabā’ith (O Allah, I seek refuge in You from the male and female devils) | Agreed upon | 13/13 | yes | Jurisprudence of Acts of Worship |
| 28 | [3348](https://hadeethenc.com/en/browse/hadith/3348) | I was a man of frequent discharge of Madhi (pre-seminal fluid) and I was too shy to ask the Prophet (may Allah's peace and blessings be upon him) about it given his daughter's status. So, I asked Al-Miqdād ibn al-Aswad to ask him and he did. Thereupon, the Prophet (may Allah's peace and blessings be upon him) said: 'Let him wash his penis and perform ablution | Agreed upon | 13/13 | yes | Jurisprudence of Acts of Worship |
| 29 | [3365](https://hadeethenc.com/en/browse/hadith/3365) | Which deed is dearest to Allah? He said: "Offering prayer at its earliest appointed time." I said: Then, what comes next? He said: "Dutifulness to one's parents." I said: Then, what comes next? He said: "Jihad in the way of Allah | Agreed upon | 13/13 | yes | Jurisprudence of Acts of Worship |
| 30 | [3461](https://hadeethenc.com/en/browse/hadith/3461) | It was sufficient for you to do this with your hands." Then, he struck the ground once with his hands, then wiped the right hand with the left one, the back side of his hands and his face | Agreed upon | 13/13 | yes | Jurisprudence of Acts of Worship |
| 31 | [3512](https://hadeethenc.com/en/browse/hadith/3512) | I gave the Messenger of Allah (may Allah's peace and blessings be upon him) a pledge to testify that there is no god but Allah and that Muhammad is the Messenger of Allah, to establish the prayer, to pay Zakah, to hear and obey, and to give sincere advice to every Muslim | Agreed upon | 13/13 | yes | Jurisprudence of Acts of Worship |
| 32 | [8386](https://hadeethenc.com/en/browse/hadith/8386) | A man performed ablution and left a small part on his foot equal to the size of a nail unwashed. The Prophet (may Allah's peace and blessings be upon him) saw that and said: "Go back and perform your ablution properly." He performed it again and prayed | Narrated by Muslim | 13/13 | yes | Jurisprudence of Acts of Worship |
| 33 | [10015](https://hadeethenc.com/en/browse/hadith/10015) | Wait for as long as your menstrual period normally stops you, and then take a ritual bath | Narrated by Muslim | 13/13 | yes | Jurisprudence of Acts of Worship |
| 34 | [65080](https://hadeethenc.com/en/browse/hadith/65080) | The Prophet (may Allah’s peace and blessings be upon him) used to perform ablution upon every prayer | Narrated by Al-Bukhāri | 13/13 | yes | Jurisprudence of Acts of Worship |
| 35 | [65081](https://hadeethenc.com/en/browse/hadith/65081) | The Prophet (may Allah’s peace and blessings be upon him) performed ablution by washing the body parts once | Narrated by Al-Bukhāri | 13/13 | yes | Jurisprudence of Acts of Worship |
| 36 | [65082](https://hadeethenc.com/en/browse/hadith/65082) | The Prophet (may Allah’s peace and blessings be upon him) performed ablution by washing the body parts twice | Narrated by Al-Bukhāri | 13/13 | yes | Jurisprudence of Acts of Worship |
| 37 | [65089](https://hadeethenc.com/en/browse/hadith/65089) | He who builds a mosque for Allah, Allah will build for him the like of it in Paradise.' | Agreed upon | 13/13 | yes | Jurisprudence of Acts of Worship |
| 38 | [65101](https://hadeethenc.com/en/browse/hadith/65101) | When the Messenger of Allah (may Allah’s peace and blessings be upon him) raised his back from Rukū‘ (bowing), he would say: "Sami‘a allāhu liman hamidah | Narrated by Muslim | 13/13 | yes | Jurisprudence of Acts of Worship |
| 39 | [2753](https://hadeethenc.com/en/browse/hadith/2753) | Perform ‘Umrah when Ramadan comes, for ‘Umrah in it is equivalent to Hajj | Agreed upon | 13/13 | yes | Jurisprudence of Acts of Worship |
| 40 | [3075](https://hadeethenc.com/en/browse/hadith/3075) | I was with the Prophet (may Allah's peace and blessings be upon him) when he arrived at the dump of some people and passed urine while standing | Agreed upon | 13/13 | yes | Jurisprudence of Acts of Worship |

## The Prophet's life

*In depth* · `seerah` · today: **194** hadith in English · pass rules 2–3: **102** · shortlisted: **40** (5 in all thirteen languages, 15 in Swedish)

| # | HadeethEnc | Hadith | Reported by | Languages | Sv | Branch |
|---:|---|---|---|---:|:-:|---|
| 1 | [3110](https://hadeethenc.com/en/browse/hadith/3110) | Shall I tell you something about the Anti-Christ that no prophet has ever told his people? Verily, he is one-eyed and will bring with him something like Paradise and Hellfire | Agreed upon | 12/13 | yes | Prophet's Biography |
| 2 | [3145](https://hadeethenc.com/en/browse/hadith/3145) | There is no god but Allah. Woe to the Arabs from an impending evil. Today, an opening has been made in the wall of Gog and Magog, like this, | Agreed upon | 12/13 | yes | Prophet's Biography |
| 3 | [4239](https://hadeethenc.com/en/browse/hadith/4239) | The Messenger of Allah (may Allah's peace and blessings be upon him) died when my house was void of any edible thing except for a small quantity of barley I had on a shelf and from which I kept eating it for a long time. Then when I measured what was left of it, it soon finished | Narrated by Bukhari & Muslim | 11/13 | — | Prophet's Biography |
| 4 | [65050](https://hadeethenc.com/en/browse/hadith/65050) | The Messenger of Allah (may Allah’s peace and blessings be upon him) received divine revelation at the age of forty | Agreed upon | 13/13 | yes | Prophet's Biography |
| 5 | [3063](https://hadeethenc.com/en/browse/hadith/3063) | When the Prophet (may Allah's peace and blessings be upon him) got up at night, he would cleanse his mouth with Siwak (tooth-stick) | Agreed upon | 12/13 | yes | Prophet's Biography |
| 6 | [3537](https://hadeethenc.com/en/browse/hadith/3537) | The Prophet (may Allah's peace and blessings be upon him) delayed the ‘Ishā' prayer until part of the night had passed and it was dark. ‘Umar came to him saying: O Messenger of Allah, come to pray, the women and children have slept. He came out with his head dripping with water and said: Had it not been hard for my Ummah, I would have commanded them to perform that prayer at this hour | Narrated by Bukhari & Muslim | 11/13 | — | Prophet's Biography |
| 7 | [4247](https://hadeethenc.com/en/browse/hadith/4247) | The Prophet (may Allah's peace and blessings be upon him) used to sleep at the beginning of the night and rise at its end to pray | Narrated by Bukhari & Muslim | 11/13 | — | Prophet's Biography |
| 8 | [4829](https://hadeethenc.com/en/browse/hadith/4829) | When the Messenger of Allah (may Allah's peace and blessings be upon him) missed prayer at night because of sickness or otherwise, he would pray twelve Rak‘ahs during the daytime | Narrated by Muslim | 11/13 | — | Prophet's Biography |
| 9 | [6179](https://hadeethenc.com/en/browse/hadith/6179) | The Messenger of Allah (may Allah's peace and blessings be upon him) was the most generous of people, and he used to be more generous than ever in Ramadan when Gabriel (Jibrīl) would meet him | Agreed upon | 12/13 | yes | Prophet's Biography |
| 10 | [3194](https://hadeethenc.com/en/browse/hadith/3194) | A man asked the Prophet (may Allah's peace and blessings be upon him) during the Battle of Uhud: "If I am killed, where do you think I would be?" He replied: "In Paradise." So the man threw some dates that were in his hand and fought until he was killed | Narrated by Bukhari & Muslim | 11/13 | — | Prophet's Biography |
| 11 | [3226](https://hadeethenc.com/en/browse/hadith/3226) | The Messenger of Allah (may Allah's peace and blessings be upon him) used to pray while carrying Umāmah the daughter of Zaynab, daughter of the Messenger of Allah (may Allah's peace and blessings be upon him) | Narrated by Bukhari & Muslim | 11/13 | — | Prophet's Biography |
| 12 | [3570](https://hadeethenc.com/en/browse/hadith/3570) | He did a little but was greatly rewarded | Narrated by Bukhari & Muslim | 11/13 | — | Prophet's Biography |
| 13 | [3628](https://hadeethenc.com/en/browse/hadith/3628) | Give it to him, for the best among you are those who settle their debts in the best manner | Narrated by Bukhari & Muslim | 11/13 | — | Prophet's Biography |
| 14 | [3769](https://hadeethenc.com/en/browse/hadith/3769) | The Messenger of Allah (may Allah's peace and blessings be upon him) used to leave fasting in a certain month until we would think that he has not fasted at all that month; and he used to fast in another month so much that we would think he has not stopped fasting at all in that month. If one wished to see him praying at night, one could see him (in that state), and if one wished to see him sleeping at night, one could see him (in that state) too | Narrated by Bukhari | 11/13 | — | Prophet's Biography |
| 15 | [4231](https://hadeethenc.com/en/browse/hadith/4231) | The Prophet (may Allah's peace and blessings be upon him) bought a camel from him, and he weighed out (the price) and paid him more than his due | Narrated by Bukhari & Muslim | 11/13 | — | Prophet's Biography |
| 16 | [4524](https://hadeethenc.com/en/browse/hadith/4524) | The Messenger of Allah (may Allah's peace and blessings be upon him) prohibited Wisāl (continuous fasting for two days). So they said to him: But you practice Wisāl! He said: I am not like you. I am provided with food and drink (by my Lord) | Narrated by Bukhari & Muslim | 11/13 | — | Prophet's Biography |
| 17 | [5806](https://hadeethenc.com/en/browse/hadith/5806) | Let him, and pour a bucket or pail of water onto his urine. You were sent to make things easy and not to make them difficult | Al-Bukhari and Muslim. This is the wording of Al-Bukhari | 11/13 | — | Prophet's Biography |
| 18 | [5817](https://hadeethenc.com/en/browse/hadith/5817) | I used to pray with the Prophet (may Allah's peace and blessings be upon him) and his prayer was moderate in length and his sermon was moderate in length | Narrated by Muslim | 11/13 | — | Prophet's Biography |
| 19 | [5881](https://hadeethenc.com/en/browse/hadith/5881) | The Messenger of Allah (may Allah's peace and blessings be upon him) bought food from a Jew and pledged him his iron armor | Narrated by Bukhari & Muslim | 11/13 | — | Prophet's Biography |
| 20 | [3022](https://hadeethenc.com/en/browse/hadith/3022) | The Messenger of Allah (may Allah’s peace and blessings be upon him) entered Makkah from Kadā', from the upper mountain pass which is in Al-Bat-hā', and exited from the lower mountain pass. | Narrated by Bukhari & Muslim | 11/13 | — | Prophet's Biography |
| 21 | [3450](https://hadeethenc.com/en/browse/hadith/3450) | O Messenger of Allah, I could not offer the ‘Asr prayer till the sun had set. The Prophet (may Allah's peace and blessings be upon him) said: By Allah! I have not yet prayed it either. So we went to But-hān, and he performed ablution and so did we, and then he offered the ‘Asr prayer after the sun had set and then followed it with the Maghrib prayer | Narrated by Bukhari & Muslim | 11/13 | — | Prophet's Biography |
| 22 | [4440](https://hadeethenc.com/en/browse/hadith/4440) | The Messenger of Allah (may Allah's peace and blessings be upon him) entered Makkah in the Year of the Conquest wearing a helmet on his head. When he took it off, a man came to him and said: Ibn Khatal is hanging on to the drapes of the Ka‘bah, so he (the Prophet, may Allah's peace and blessings be upon him) said: Kill him | Narrated by Bukhari & Muslim | 11/13 | — | Prophet's Biography |
| 23 | [3227](https://hadeethenc.com/en/browse/hadith/3227) | I will do my best to lead you in prayer just as the Messenger of Allah (may Allah's peace and blessings be upon him) used to lead us in prayer | Narrated by Bukhari & Muslim | 11/13 | — | Prophet's Biography |
| 24 | [3463](https://hadeethenc.com/en/browse/hadith/3463) | Whenever the Prophet (may Allah's peace and blessings be upon him) spoke a word, he would repeat it thrice until it is understood from him. Whenever he greeted a group of people, he would greet them thrice | Narrated by Bukhari | 11/13 | — | Prophet's Biography |
| 25 | [4940](https://hadeethenc.com/en/browse/hadith/4940) | I was walking with the Messenger of Allah (may Allah's peace and blessings be upon him) and he was wearing a Najrāni cloak with a thick hem. A Bedouin approached him and pulled him violently by his cloak | Narrated by Bukhari & Muslim | 11/13 | — | Prophet's Biography |
| 26 | [5440](https://hadeethenc.com/en/browse/hadith/5440) | Whoever does not show mercy will not be shown mercy | Narrated by Bukhari & Muslim | 11/13 | — | Prophet's Biography |
| 27 | [5807](https://hadeethenc.com/en/browse/hadith/5807) | They left me no alternative but that they either beg of me importunately or regard me as a miser, and I am not a miser | Narrated by Muslim | 11/13 | — | Prophet's Biography |
| 28 | [6386](https://hadeethenc.com/en/browse/hadith/6386) | We went out along with the children to meet the Messenger of Allah (may Allah's peace and blessings be upon him) at Thaniyyat al-Wadā‘ | Narrated by Bukhari - Narrated by Abu Daoud | 11/13 | — | Prophet's Biography |
| 29 | [6390](https://hadeethenc.com/en/browse/hadith/6390) | The angels continue to shade him with their wings | Narrated by Bukhari & Muslim | 11/13 | — | Prophet's Biography |
| 30 | [5330](https://hadeethenc.com/en/browse/hadith/5330) | O Allah, treat harshly those who have any charge over my Ummah and treat them harshly, and treat gently those who have any charge over my Ummah and treat them gently | Narrated by Muslim | 13/13 | yes | Prophet's Biography |
| 31 | [6180](https://hadeethenc.com/en/browse/hadith/6180) | The Messenger of Allah (may Allah's peace and blessings be upon him) was the best of people in terms of morals | Agreed upon | 13/13 | yes | Prophet's Biography |
| 32 | [3018](https://hadeethenc.com/en/browse/hadith/3018) | The Prophet (may Allah's peace and blessings be upon him) preferred beginning with the right side when wearing his sandals, combing his hair, purifying himself, and in all of his affairs | Agreed upon | 12/13 | yes | Prophet's Biography |
| 33 | [3060](https://hadeethenc.com/en/browse/hadith/3060) | I have never seen the Prophet (may Allah's peace and blessings be upon him) laughing so heartily to the extent of seeing his uvulae; rather, he would only smile | Agreed upon | 12/13 | yes | Prophet's Biography |
| 34 | [3153](https://hadeethenc.com/en/browse/hadith/3153) | The Prophet (may Allah's peace and blessings be upon him) was more bashful than a virgin in her boudoir. Whenever he saw something he disliked, we could perceive that on his face | Agreed upon | 12/13 | yes | Prophet's Biography |
| 35 | [3154](https://hadeethenc.com/en/browse/hadith/3154) | He tells us to worship Allah alone and not associate anything with Him and to give up all what our ancestors said. He also commands us to perform prayers, speak the truth... | Narrated by Bukhari & Muslim | 11/13 | — | Prophet's Biography |
| 36 | [3220](https://hadeethenc.com/en/browse/hadith/3220) | When the Prophet (may Allah's peace and blessings be upon him) prayed, he used to spread out his hands until the whiteness of his armpits would be visible | Agreed upon | 13/13 | yes | Prophet's Biography |
| 37 | [3364](https://hadeethenc.com/en/browse/hadith/3364) | Had it not been that I might overburden the believers—or my Ummah—I would have commanded them to use the Siwāk (toothstick) at every prayer | Agreed upon | 12/13 | yes | Prophet's Biography |
| 38 | [3476](https://hadeethenc.com/en/browse/hadith/3476) | The Prophet (may Allah's peace and blessings be upon him) and I used to take a ritual bath from one pot when we were both Junub (in a state of major ritual impurity). During my menses, he would order me to put on a lower garment, and he would fondle me | Agreed upon | 13/13 | yes | Prophet's Biography |
| 39 | [6078](https://hadeethenc.com/en/browse/hadith/6078) | What is the matter with those people who said such-and-such? But indeed, I pray and sleep, I fast and break the fast, and I marry women. Whoever turns away from my Sunnah does not belong to me | Agreed upon | 12/13 | yes | Prophet's Biography |
| 40 | [6389](https://hadeethenc.com/en/browse/hadith/6389) | The Messenger of Allah (may Allah's peace and blessings be upon him) was never given a choice between two things except that he would choose the easier of the two unless it were a sin. If it were a sin, he would be the farthest of people from it | Agreed upon | 12/13 | yes | Prophet's Biography |

