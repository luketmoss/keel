// The Beef Stew walkthrough for demo mode (#711): forage/apps-script/tests/fixtures/beef-stew.walkthrough.json,
// the document the format was tried on, for the demo's Beef Stew (whose lines are that fixture's).
import type { Walkthrough } from '../api/types';

export const DEMO_STEW_WALKTHROUGH: Walkthrough = {
  format: 1,
  recipe: 'rc_demo_stew',
  note: "The source chops every vegetable up front. Here they're cut during the 90-minute simmer, and the thickener is mixed during the last 30.",
  equipment: ['Dutch oven with lid', 'Large bowl', '2 small bowls', 'Liquid measuring cup'],
  prep: [
    {
      id: 'beef',
      title: 'Coat the beef',
      when: 'start',
      uses: [
        {
          line: 'L1',
        },
        {
          line: 'L2',
          share: 0.5,
        },
        {
          line: 'L3',
          share: 0.6667,
        },
        {
          line: 'L4',
        },
      ],
      tasks: [
        'Cut any large pieces of beef into 1-inch cubes',
        'Toss the beef with the salt',
        'Mix the flour and paprika in the large bowl',
        'Coat the beef in the flour a few pieces at a time',
      ],
      makes: 'Floured beef',
    },
    {
      id: 'base',
      title: 'Flavor base',
      when: 'start',
      uses: [
        {
          line: 'L6',
        },
        {
          line: 'L7',
        },
        {
          line: 'L8',
        },
      ],
      tasks: ['Mince the garlic', 'Put the tomato paste, herbes de Provence and garlic in a small bowl'],
      makes: 'Paste bowl',
    },
    {
      id: 'wine',
      title: 'Measure the wine',
      when: 'start',
      uses: [
        {
          line: 'L9',
        },
      ],
      tasks: ['Measure the wine and set it by the stove'],
      makes: 'Wine',
    },
    {
      id: 'broth',
      title: 'Broth with herbs',
      when: 'start',
      uses: [
        {
          line: 'L10',
        },
        {
          line: 'L11',
          share: 0.6667,
        },
        {
          line: 'L12',
        },
      ],
      tasks: [
        'Mince all the rosemary; keep a third of it for the end',
        'Add the rest of the rosemary and the bay leaves to the broth',
      ],
      makes: 'Broth with herbs',
    },
    {
      id: 'veg',
      title: 'Cut the vegetables',
      when: 'simmer',
      uses: [
        {
          line: 'L13',
        },
        {
          line: 'L14',
        },
        {
          line: 'L15',
        },
      ],
      tasks: ['Peel and cube the potatoes', 'Coarsely chop the onions (about 2 large)', 'Slice the carrots'],
      makes: 'Vegetables',
    },
    {
      id: 'thicken',
      title: 'Mix the thickener',
      when: 'veg-in',
      uses: [
        {
          line: 'L11',
          share: 0.3333,
        },
        {
          line: 'L2',
          share: 0.5,
        },
        {
          line: 'L3',
          share: 0.3333,
        },
        {
          line: 'L16',
        },
        {
          line: 'L17',
        },
        {
          line: 'L18',
        },
      ],
      tasks: [
        'In a small bowl, mix the remaining rosemary, salt and flour',
        'Stir in the cold water and vinegar until smooth',
        'Measure the peas',
      ],
      makes: 'Thickener, and peas',
    },
  ],
  cook: [
    {
      id: 'brown',
      title: 'Brown the beef',
      do: "Heat the oil in the Dutch oven over medium heat. Brown the beef in two batches so the pieces don't touch.",
      uses: [
        {
          prep: 'beef',
        },
        {
          line: 'L5',
        },
      ],
      heat: 'Medium',
      timer: {
        min: 10,
        label: 'Browning',
      },
      lookFor: 'A dark crust on most sides. Crowded meat steams instead of browning.',
    },
    {
      id: 'bloom',
      title: 'Cook the flavor base',
      do: 'Return all the beef to the pot. Stir in the paste bowl and cook until fragrant.',
      uses: [
        {
          prep: 'base',
        },
      ],
      heat: 'Medium',
      timer: {
        min: 2,
        label: 'Flavor base',
      },
      lookFor: 'It smells fragrant and the beef darkens slightly.',
    },
    {
      id: 'deglaze',
      title: 'Deglaze with wine',
      do: 'Pour in the wine, scraping up the browned bits. Bring to a boil, then simmer until reduced by half.',
      uses: [
        {
          prep: 'wine',
        },
      ],
      heat: 'Medium-high, then medium',
      timer: {
        min: 5,
        label: 'Reduce wine',
      },
      lookFor: 'About half the wine is gone and the bottom of the pot is clean.',
    },
    {
      id: 'simmer',
      title: 'Simmer covered',
      do: 'Add the broth with the herbs. Bring to a boil, lower the heat, cover and simmer.',
      uses: [
        {
          prep: 'broth',
        },
      ],
      heat: 'Low',
      wait: {
        min: 90,
        label: 'Simmer',
      },
      lookFor: 'The meat is almost tender.',
      meanwhile: ['veg'],
    },
    {
      id: 'veg-in',
      title: 'Add the vegetables',
      do: 'Stir in the vegetables. Cover and keep simmering.',
      uses: [
        {
          prep: 'veg',
        },
      ],
      heat: 'Low',
      wait: {
        min: 30,
        label: 'Vegetables',
      },
      lookFor: 'A potato cube breaks easily with a spoon.',
      meanwhile: ['thicken'],
    },
    {
      id: 'finish',
      title: 'Thicken and finish',
      do: 'Take out the bay leaves. Stir in the thickener and bring to a boil. Add the peas and cook, stirring, until thickened.',
      uses: [
        {
          prep: 'thicken',
        },
      ],
      heat: 'Medium-high',
      timer: {
        min: 2,
        label: 'Thicken',
      },
      lookFor: 'The stew coats a spoon.',
    },
    {
      id: 'serve',
      title: 'Serve',
      do: 'Top with extra fresh rosemary if you like.',
      uses: [
        {
          line: 'L19',
        },
      ],
    },
  ],
};
