from pathlib import Path

votes = Path('functions/src/votes.mjs')
tests = Path('functions/test/votes.test.mjs')
text = votes.read_text()

replacement = """  // A second round is always limited to the two highest-ranked candidates.
  const secondRoundOptionExternalIds = suggestSecondRound
    ? ranked.slice(0,2).map(x=>x.optionExternalId)
    : [];"""

if 'ranked.slice(0,2)' not in text:
    start = text.find('  let secondRoundOptionExternalIds=[];')
    end = text.find('\n\n  return {', start)
    if start < 0 or end < 0:
        raise SystemExit('SECOND_ROUND_BLOCK_NOT_FOUND')
    text = text[:start] + replacement + text[end:]

legacy = "eligible=(result.secondRoundOptionExternalIds??[]).filter(Boolean);"
safe = "eligible=(result.secondRoundOptionExternalIds??[]).filter(Boolean).slice(0,2);"
if safe not in text:
    if legacy not in text:
        raise SystemExit('SECOND_ROUND_OPEN_LINE_NOT_FOUND')
    text = text.replace(legacy, safe, 1)

votes.write_text(text)

test_text = tests.read_text()
swaps = [
    ("test('no majority suggests second round and keeps ties at the qualification cutoff'", "test('no majority suggests a second round with exactly the top two candidates'"),
    ("assert.deepEqual(out.secondRoundOptionExternalIds,['OPT_A','OPT_B','OPT_C']);", "assert.deepEqual(out.secondRoundOptionExternalIds,['OPT_A','OPT_B']);"),
    ("test('second round keeps every candidate tied at the qualification cutoff'", "test('second round always keeps exactly the two highest-ranked candidates'"),
    ("assert.deepEqual(allTied.secondRoundOptionExternalIds,['OPT_A','OPT_B','OPT_C','OPT_D','OPT_E']);", "assert.deepEqual(allTied.secondRoundOptionExternalIds,['OPT_A','OPT_B']);"),
    ("assert.deepEqual(tiedForSecond.secondRoundOptionExternalIds,['OPT_A','OPT_B','OPT_C','OPT_D']);", "assert.deepEqual(tiedForSecond.secondRoundOptionExternalIds,['OPT_A','OPT_B']);"),
]
for old, new in swaps:
    if old in test_text:
        test_text = test_text.replace(old, new, 1)
    elif new not in test_text:
        raise SystemExit(f'TEST_FRAGMENT_NOT_FOUND: {old}')

marker = 'opening a legacy second round trims stored qualifiers to the top two'
if marker not in test_text:
    test_text += r'''

test('opening a legacy second round trims stored qualifiers to the top two',async()=>{
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
});
'''

tests.write_text(test_text)
