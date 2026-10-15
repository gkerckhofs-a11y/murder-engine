from pathlib import Path

votes = Path('functions/src/votes.mjs')
tests = Path('functions/test/votes.test.mjs')
text = votes.read_text()

strict_block = """  // A second round is always limited to the two highest-ranked candidates.
  const secondRoundOptionExternalIds = suggestSecondRound
    ? ranked.slice(0,2).map(x=>x.optionExternalId)
    : [];"""

leader_tie_block = """  // A second round normally keeps the two highest-ranked candidates.
  // Only an equality for first place keeps every candidate tied for the lead.
  let secondRoundOptionExternalIds=[];
  if(suggestSecondRound&&ranked.length>=2){
    const leadVotes=ranked[0].votes;
    const leaders=ranked.filter(x=>x.votes===leadVotes);
    secondRoundOptionExternalIds=(leaders.length>=2?leaders:ranked.slice(0,2))
      .map(x=>x.optionExternalId);
  }"""

if leader_tie_block not in text:
    if strict_block not in text:
        raise SystemExit('STRICT_SECOND_ROUND_BLOCK_NOT_FOUND')
    text = text.replace(strict_block, leader_tie_block, 1)

old_open = "eligible=(result.secondRoundOptionExternalIds??[]).filter(Boolean).slice(0,2);"
new_open = """const ranked=Array.isArray(result.ranked)?result.ranked:[];
    if(ranked.length>=2){
      const leadVotes=ranked[0].votes;
      const leaders=ranked.filter(x=>x.votes===leadVotes);
      eligible=(leaders.length>=2?leaders:ranked.slice(0,2))
        .map(x=>x.optionExternalId)
        .filter(Boolean);
    }else{
      eligible=(result.secondRoundOptionExternalIds??[]).filter(Boolean);
    }"""

if new_open not in text:
    if old_open not in text:
        raise SystemExit('STRICT_SECOND_ROUND_OPEN_LINE_NOT_FOUND')
    text = text.replace(old_open, new_open, 1)

votes.write_text(text)

test_text = tests.read_text()
replacements = [
    ("test('no majority suggests a second round with exactly the top two candidates'", "test('a unique leader qualifies with only one runner-up'"),
    ("test('second round always keeps exactly the two highest-ranked candidates'", "test('only a tie for first place keeps every tied leader'"),
    ("assert.deepEqual(allTied.secondRoundOptionExternalIds,['OPT_A','OPT_B']);", "assert.deepEqual(allTied.secondRoundOptionExternalIds,['OPT_A','OPT_B','OPT_C','OPT_D','OPT_E']);"),
]
for old, new in replacements:
    if old in test_text:
        test_text = test_text.replace(old, new, 1)
    elif new not in test_text:
        raise SystemExit(f'TEST_FRAGMENT_NOT_FOUND: {old}')

# The tied-for-second fixture has one clear leader and three equal runners-up.
# Only one runner-up qualifies because the exception applies only to a tie for first.
expected_tied_second = "assert.deepEqual(tiedForSecond.secondRoundOptionExternalIds,['OPT_A','OPT_B']);"
if expected_tied_second not in test_text:
    raise SystemExit('TIED_SECOND_EXPECTATION_NOT_FOUND')

old_legacy_test = r'''test('opening a legacy second round trims stored qualifiers to the top two',async()=>{
  const rt=runtime();
  rt.sessionVotes=[{
    voteExternalId:'VOTE_1',
    round:1,
    status:'CLOSED',
    eligibleOptionExternalIds:'OPT_A;OPT_B;OPT_C',
    resultJson:JSON.stringify({secondRoundOptionExternalIds:['OPT_A','OPT_B','OPT_C']})
  }];
  const writes=[];
  const out=await openSessionVote('S1',{voteExternalId:'VOTE_1',secondRound:true},{
    reader:readerFor(session(),source(),rt),
    executor:async(op,vars)=>{writes.push({op,vars});return{};},
    now:()=>new Date('2026-10-15T20:30:00Z')
  });
  assert.equal(out.round,2);
  assert.deepEqual(out.eligibleOptionExternalIds,['OPT_A','OPT_B']);
  assert.equal(writes[0].vars.data.eligibleOptionExternalIds,'OPT_A;OPT_B');
});'''

new_legacy_test = r'''test('opening a second round recomputes the qualification rule from the ranking',async()=>{
  const rt=runtime();
  rt.sessionVotes=[{
    voteExternalId:'VOTE_1',
    round:1,
    status:'CLOSED',
    eligibleOptionExternalIds:'OPT_A;OPT_B;OPT_C',
    resultJson:JSON.stringify({
      ranked:[
        {optionExternalId:'OPT_A',votes:2,orderIndex:1},
        {optionExternalId:'OPT_B',votes:1,orderIndex:2},
        {optionExternalId:'OPT_C',votes:1,orderIndex:3},
      ],
      secondRoundOptionExternalIds:['OPT_A','OPT_B','OPT_C']
    })
  }];
  const writes=[];
  const out=await openSessionVote('S1',{voteExternalId:'VOTE_1',secondRound:true},{
    reader:readerFor(session(),source(),rt),
    executor:async(op,vars)=>{writes.push({op,vars});return{};},
    now:()=>new Date('2026-10-15T20:30:00Z')
  });
  assert.equal(out.round,2);
  assert.deepEqual(out.eligibleOptionExternalIds,['OPT_A','OPT_B']);
  assert.equal(writes[0].vars.data.eligibleOptionExternalIds,'OPT_A;OPT_B');
});

test('opening a second round preserves every candidate tied for first place',async()=>{
  const rt=runtime();
  rt.sessionVotes=[{
    voteExternalId:'VOTE_1',
    round:1,
    status:'CLOSED',
    eligibleOptionExternalIds:'OPT_A;OPT_B;OPT_C',
    resultJson:JSON.stringify({
      ranked:[
        {optionExternalId:'OPT_A',votes:2,orderIndex:1},
        {optionExternalId:'OPT_B',votes:2,orderIndex:2},
        {optionExternalId:'OPT_C',votes:2,orderIndex:3},
      ],
      secondRoundOptionExternalIds:['OPT_A','OPT_B']
    })
  }];
  const writes=[];
  const out=await openSessionVote('S1',{voteExternalId:'VOTE_1',secondRound:true},{
    reader:readerFor(session(),source(),rt),
    executor:async(op,vars)=>{writes.push({op,vars});return{};},
    now:()=>new Date('2026-10-15T20:31:00Z')
  });
  assert.deepEqual(out.eligibleOptionExternalIds,['OPT_A','OPT_B','OPT_C']);
  assert.equal(writes[0].vars.data.eligibleOptionExternalIds,'OPT_A;OPT_B;OPT_C');
});'''

if new_legacy_test not in test_text:
    if old_legacy_test not in test_text:
        raise SystemExit('LEGACY_SECOND_ROUND_TEST_NOT_FOUND')
    test_text = test_text.replace(old_legacy_test, new_legacy_test, 1)

tests.write_text(test_text)
