const sections = [
  {
    title: 'Play your character',
    body: <>
      <p>Read your story, objectives and relationships in <strong>Sheet</strong>. This is what your character knows at the beginning of the game.</p>
      <p>You are free to talk, negotiate, lie, protect your secrets and form alliances. Compare accounts and documents: an accusation or a rumour alone does not establish the truth.</p>
    </>,
  },
  {
    title: 'Manage your Action Points',
    body: <>
      <p>You start with <strong>5 Action Points — AP</strong>. Searching a location or using a special ability costs <strong>1 AP</strong>. The app asks you to confirm before spending them.</p>
      <p>Conversations, ordinary negotiations, voluntary gifts of transferable evidence and money transfers do not cost AP.</p>
      <p>Even with no AP left, you can keep investigating through conversations, exchange discoveries and take part in votes.</p>
    </>,
  },
  {
    title: 'Search locations',
    body: <>
      <p>From <strong>Play</strong>, scan the QR code at the location you want to search.</p>
      <ul>
        <li>Each search costs <strong>1 AP</strong> and automatically reveals one available discovery, with no die roll.</li>
        <li>Wait <strong>10 minutes between searches</strong>, even if you move to another location.</li>
        <li>You cannot search <strong>your own bedroom</strong>.</li>
        <li>If the location has nothing left for you to discover, no AP is spent.</li>
      </ul>
      <p>Some objects and documents can be taken away and are then no longer available at that location. Other discoveries, such as an observation or testimony, remain available to other players.</p>
      <p>If the app tells you to collect a physical item, show the displayed pickup code to the Game Master.</p>
    </>,
  },
  {
    title: 'Use your special ability',
    body: <>
      <p>The abilities available to your character appear in <strong>Play</strong>. Each costs <strong>1 AP</strong>:</p>
      <ul>
        <li><strong>Charm:</strong> the target must choose one piece of information they know and reveal it to you. They keep that knowledge.</li>
        <li><strong>Negotiation:</strong> offer one transferable piece of evidence from your Bag. The target must choose one of their transferable pieces of evidence in return, and the app swaps them. Both of you must have evidence available to exchange.</li>
        <li><strong>Police Intimidation:</strong> choose and take one transferable piece of evidence from those accessible on the target. The target is informed of the intimidation.</li>
        <li><strong>Rumour Network:</strong> choose a character from the list to receive a prepared rumour about them. No QR scan or GM approval is needed.</li>
        <li><strong>Business Deal:</strong> write a financial agreement. The other player may accept or refuse. An accepted agreement must then be validated by the GM to become official.</li>
      </ul>
      <p>Charm, Negotiation, Police Intimidation and Rumour Network can each be used <strong>once per target</strong>, with no waiting period between different targets.</p>
      <p>For face-to-face actions, scan the QR code presented by the other player. If you receive an ability request, open <strong>Play</strong> and make the required choice.</p>
    </>,
  },
  {
    title: 'Knowledge and possessions',
    body: <>
      <p>Your <strong>Notebook</strong> holds your knowledge and discoveries. Your <strong>Bag</strong> contains the evidence and objects you possess.</p>
      <p><strong>Sharing information</strong> lets someone else learn it. <strong>Giving evidence</strong> transfers possession. A discovery saved in your Notebook stays there even after the associated object changes hands.</p>
      <p>Use the buttons provided by the app to record your exchanges.</p>
    </>,
  },
  {
    title: 'Put your money to use',
    body: <>
      <p>Your character's money can buy information, pay for a service, settle a debt or secure support.</p>
      <p>Make transfers from <strong>Bag</strong>; they do not cost AP. Payment does not guarantee that the other player is telling the truth or will keep a promise.</p>
    </>,
  },
  {
    title: 'Vote and follow the news',
    body: <>
      <p>Open votes you are eligible for appear in <strong>Play</strong>. Submit your choice and wait for confirmation that it has been recorded.</p>
      <p>In SHOWBIZ, the players elect the five jury members. After the auditions, this jury chooses the leading actress. A separate vote lets you name the person you accuse of the murder.</p>
      <p>Check <strong>News</strong> for announcements, messages and published results.</p>
      <p>If you are unsure about a rule or situation, ask the <strong>Game Master — GM</strong>.</p>
    </>,
  },
];

export default function ShowbizGameRules() {
  return <section className="playerCard rulesCard showbizRules" aria-labelledby="showbiz-rules-title" lang="en">
    <p className="playerSectionKicker">GAME RULES</p>
    <h2 id="showbiz-rules-title">How to play</h2>
    <p className="scenarioRuleIntro">Investigate Vivienne Vale's death, pursue your own interests and navigate the struggle for influence around <em>Midnight Orchid</em>. Your character has personal objectives: you choose your alliances and the risks you take.</p>
    <p className="showbizRulesHint">Open a section to read the rules.</p>
    {sections.map(section => <details className="showbizRuleSection" key={section.title}>
      <summary>{section.title}</summary>
      <div className="showbizRuleBody">{section.body}</div>
    </details>)}
  </section>;
}
