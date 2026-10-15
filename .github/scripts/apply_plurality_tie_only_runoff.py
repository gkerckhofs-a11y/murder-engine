from pathlib import Path

votes_path = Path('functions/src/votes.mjs')
tests_path = Path('functions/test/votes.test.mjs')
app_path = Path('web/src/App.tsx')

votes = votes_path.read_text()

old_decision = """  const majorityAbsolute = winner ? winner.votes > totalWeight / 2 : false;
  const tieForLead = ranked.length > 1 && ranked[0].votes === ranked[1].votes;
  const suggestSecondRound = definition.tieRule === 'SECOND_ROUND' && !majorityAbsolute && ranked.length > 2;

  // A second round normally keeps the two highest-ranked candidates.
  // Only an equality for first place keeps every candidate tied for the lead.
  let secondRoundOptionExternalIds=[];
  if(suggestSecondRound&&ranked.length>=2){
    const leadVotes=ranked[0].votes;
    const leaders=ranked.filter(x=>x.votes===leadVotes);
    secondRoundOptionExternalIds=(leaders.length>=2?leaders:ranked.slice(0,2))
      .map(x=>x.optionExternalId);
  }"""

new_decision = """  const majorityAbsolute = winner ? winner.votes > totalWeight / 2 : false;
  const hasEffectiveVote = Boolean(validBallots > 0 && winner && Number(winner.votes) > 0);
  const tieForLead = Boolean(
    hasEffectiveVote &&
    ranked.length > 1 &&
    ranked[0].votes === ranked[1].votes
  );
  const suggestSecondRound = definition.tieRule === 'SECOND_ROUND' && tieForLead;
  const secondRoundOptionExternalIds = suggestSecondRound
    ? ranked
        .filter(x=>x.votes===ranked[0].votes)
        .map(x=>x.optionExternalId)
    : [];"""

if new_decision not in votes:
    if old_decision not in votes:
        raise SystemExit('VOTE_DECISION_BLOCK_NOT_FOUND')
    votes = votes.replace(old_decision, new_decision, 1)

old_winner = "winnerOptionExternalId: majorityAbsolute && !tieForLead ? winner?.optionExternalId ?? null : null,"
new_winner = "winnerOptionExternalId: hasEffectiveVote && !tieForLead ? winner?.optionExternalId ?? null : null,"
if new_winner not in votes:
    if old_winner not in votes:
        raise SystemExit('WINNER_ASSIGNMENT_NOT_FOUND')
    votes = votes.replace(old_winner, new_winner, 1)

old_open = """    const ranked=Array.isArray(result.ranked)?result.ranked:[];
    if(ranked.length>=2){
      const leadVotes=ranked[0].votes;
      const leaders=ranked.filter(x=>x.votes===leadVotes);
      eligible=(leaders.length>=2?leaders:ranked.slice(0,2))
        .map(x=>x.optionExternalId)
        .filter(Boolean);
    }else{
      eligible=(result.secondRoundOptionExternalIds??[]).filter(Boolean);
    }
    if(eligible.length<2) throw new Error('SECOND_ROUND_NOT_AVAILABLE');"""

new_open = """    const ranked=Array.isArray(result.ranked)?result.ranked:[];
    const tiedAtTop =
      ranked.length>=2 &&
      Number(ranked[0].votes)>0 &&
      ranked[0].votes===ranked[1].votes;

    if(tiedAtTop){
      const leadVotes=ranked[0].votes;
      eligible=ranked
        .filter(x=>x.votes===leadVotes)
        .map(x=>x.optionExternalId)
        .filter(Boolean);
    }else if(result.tieForLead===true && Number(result.validBallots??0)>0){
      eligible=(result.secondRoundOptionExternalIds??[]).filter(Boolean);
    }else{
      eligible=[];
    }

    if(eligible.length<2) throw new Error('SECOND_ROUND_NOT_AVAILABLE');"""

if new_open not in votes:
    if old_open not in votes:
        raise SystemExit('SECOND_ROUND_OPEN_BLOCK_NOT_FOUND')
    votes = votes.replace(old_open, new_open, 1)

votes_path.write_text(votes)

tests = tests_path.read_text()

def replace_test(name, next_name, replacement):
    global tests
    start = tests.find(f"test('{name}'")
    end = tests.find(f"\n\ntest('{next_name}'", start)
    if start < 0 or end < 0:
        raise SystemExit(f'TEST_BLOCK_NOT_FOUND: {name}')
    tests = tests[:start] + replacement + tests[end:]

replace_test(
    'a unique leader qualifies with only one runner-up',
    'only a tie for first place keeps every tied leader',
    r"""test('a unique plurality leader wins without a second round',()=>{
  const electorate=['A','B','C','D'];
  const out=tallyVote({definition:source().voteDefinitions[0],options:source().voteOptionDefinitions,electorate,ballots:[
    {electorCharacterExternalId:'A',selectedOptionExternalIds:'OPT_A',weight:1},
    {electorCharacterExternalId:'B',selectedOptionExternalIds:'OPT_A',weight:1},
    {electorCharacterExternalId:'C',selectedOptionExternalIds:'OPT_B',weight:1},
    {electorCharacterExternalId:'D',selectedOptionExternalIds:'OPT_C',weight:1},
  ]});
  assert.equal(out.majorityAbsolute,false);
  assert.equal(out.tieForLead,false);
  assert.equal(out.suggestSecondRound,false);
  assert.equal(out.winnerOptionExternalId,'OPT_A');
  assert.deepEqual(out.secondRoundOptionExternalIds,[]);
});"""
)

replace_test(
    'only a tie for first place keeps every tied leader',
    'dashboard hides nothing from MJ but tracks who voted',
    r"""test('only candidates tied for first place go to a second round',()=>{
  const electorate=['A','B','C','D','E'];
  const options=[
    {externalId:'OPT_A',orderIndex:1,label:'A'},
    {externalId:'OPT_B',orderIndex:2,label:'B'},
    {externalId:'OPT_C',orderIndex:3,label:'C'},
    {externalId:'OPT_D',orderIndex:4,label:'D'},
    {externalId:'OPT_E',orderIndex:5,label:'E'},
  ];
  const definition={tieRule:'SECOND_ROUND',votesPerElector:1};

  const tiedForLead=tallyVote({
    definition,options,electorate,
    ballots:[
      {electorCharacterExternalId:'A',selectedOptionExternalIds:'OPT_A',weight:1},
      {electorCharacterExternalId:'B',selectedOptionExternalIds:'OPT_A',weight:1},
      {electorCharacterExternalId:'C',selectedOptionExternalIds:'OPT_B',weight:1},
      {electorCharacterExternalId:'D',selectedOptionExternalIds:'OPT_B',weight:1},
      {electorCharacterExternalId:'E',selectedOptionExternalIds:'OPT_C',weight:1},
    ]
  });
  assert.equal(tiedForLead.tieForLead,true);
  assert.equal(tiedForLead.suggestSecondRound,true);
  assert.equal(tiedForLead.winnerOptionExternalId,null);
  assert.deepEqual(tiedForLead.secondRoundOptionExternalIds,['OPT_A','OPT_B']);

  const allTied=tallyVote({
    definition,options,electorate,
    ballots:[
      {electorCharacterExternalId:'A',selectedOptionExternalIds:'OPT_A',weight:1},
      {electorCharacterExternalId:'B',selectedOptionExternalIds:'OPT_B',weight:1},
      {electorCharacterExternalId:'C',selectedOptionExternalIds:'OPT_C',weight:1},
      {electorCharacterExternalId:'D',selectedOptionExternalIds:'OPT_D',weight:1},
      {electorCharacterExternalId:'E',selectedOptionExternalIds:'OPT_E',weight:1},
    ]
  });
  assert.equal(allTied.tieForLead,true);
  assert.deepEqual(allTied.secondRoundOptionExternalIds,['OPT_A','OPT_B','OPT_C','OPT_D','OPT_E']);

  const tiedForSecond=tallyVote({
    definition,options,electorate,
    ballots:[
      {electorCharacterExternalId:'A',selectedOptionExternalIds:'OPT_A',weight:1},
      {electorCharacterExternalId:'B',selectedOptionExternalIds:'OPT_A',weight:1},
      {electorCharacterExternalId:'C',selectedOptionExternalIds:'OPT_B',weight:1},
      {electorCharacterExternalId:'D',selectedOptionExternalIds:'OPT_C',weight:1},
      {electorCharacterExternalId:'E',selectedOptionExternalIds:'OPT_D',weight:1},
    ]
  });
  assert.equal(tiedForSecond.tieForLead,false);
  assert.equal(tiedForSecond.suggestSecondRound,false);
  assert.equal(tiedForSecond.winnerOptionExternalId,'OPT_A');
  assert.deepEqual(tiedForSecond.secondRoundOptionExternalIds,[]);
});"""
)

replace_test(
    'opening a second round recomputes the qualification rule from the ranking',
    'opening a second round preserves every candidate tied for first place',
    r"""test('a second round cannot be opened when one candidate is alone in first place',async()=>{
  const rt=runtime();
  rt.sessionVotes=[{
    voteExternalId:'VOTE_1',
    round:1,
    status:'CLOSED',
    eligibleOptionExternalIds:'OPT_A;OPT_B;OPT_C',
    resultJson:JSON.stringify({
      validBallots:4,
      tieForLead:false,
      ranked:[
        {optionExternalId:'OPT_A',votes:2,orderIndex:1},
        {optionExternalId:'OPT_B',votes:1,orderIndex:2},
        {optionExternalId:'OPT_C',votes:1,orderIndex:3},
      ],
      secondRoundOptionExternalIds:[]
    })
  }];
  await assert.rejects(
    ()=>openSessionVote('S1',{voteExternalId:'VOTE_1',secondRound:true},{
      reader:readerFor(session(),source(),rt),
      executor:async()=>({}),
      now:()=>new Date('2026-10-15T20:30:00Z')
    }),
    /SECOND_ROUND_NOT_AVAILABLE/
  );
});"""
)

old_tied_open = """      ranked:[
        {optionExternalId:'OPT_A',votes:2,orderIndex:1},
        {optionExternalId:'OPT_B',votes:2,orderIndex:2},
        {optionExternalId:'OPT_C',votes:2,orderIndex:3},
      ],
      secondRoundOptionExternalIds:['OPT_A','OPT_B']"""
new_tied_open = """      validBallots:6,
      tieForLead:true,
      ranked:[
        {optionExternalId:'OPT_A',votes:2,orderIndex:1},
        {optionExternalId:'OPT_B',votes:2,orderIndex:2},
        {optionExternalId:'OPT_C',votes:2,orderIndex:3},
      ],
      secondRoundOptionExternalIds:['OPT_A','OPT_B','OPT_C']"""
if new_tied_open not in tests:
    if old_tied_open not in tests:
        raise SystemExit('TIED_OPEN_FIXTURE_NOT_FOUND')
    tests = tests.replace(old_tied_open, new_tied_open, 1)

tests_path.write_text(tests)

app = app_path.read_text()
old_summary = "{v.result.majorityAbsolute&&v.result.winnerOptionExternalId?'Majorité obtenue':'Pas de majorité absolue'}"
new_summary = "{v.result.winnerOptionExternalId?'Résultat définitif':v.result.tieForLead?'Égalité en tête':'Aucun résultat définitif'}"
if new_summary not in app:
    if old_summary not in app:
        raise SystemExit('VOTE_RESULT_SUMMARY_NOT_FOUND')
    app = app.replace(old_summary, new_summary, 1)
app_path.write_text(app)
