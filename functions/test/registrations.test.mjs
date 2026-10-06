import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPrecastCampaign,
  getPublicPrecastCampaign,
  submitPublicPrecastRegistration,
  createSessionFromPrecast,
  __precastOps,
} from '../src/registrations.mjs';

test('pre-casting campaign is created from a scenario without requiring a session', async()=>{
  let write;
  const out=await createPrecastCampaign({
    scenarioId:'SC1',
    name:'Cosa Nostra — October',
    language:'EN',
  },{
    reader:async operation=>{
      assert.equal(operation,__precastOps.GET_SCENARIO_QUERY);
      return {scenario:{
        id:'SC1',title:'Cosa Nostra',
        organization:{id:'ORG1'},
        scenarioVersions_on_scenario:[{id:'V1',language:'EN'}],
      }};
    },
    executor:async(operation,variables)=>{
      write={operation,variables};
      return {};
    },
  });

  assert.equal(out.status,'OPEN');
  assert.equal(out.language,'EN');
  assert.ok(out.token.length>=24);
  assert.equal(write.operation,__precastOps.CREATE_CAMPAIGN_MUTATION);
  assert.equal(write.variables.data.scenarioId,'SC1');
  assert.equal(write.variables.data.organizationId,'ORG1');
});

test('public campaign exposes a scenario pitch and tracks openings', async()=>{
  const writes=[];
  const campaign=await getPublicPrecastCampaign('A'.repeat(32),{
    reader:async operation=>{
      assert.equal(operation,__precastOps.PUBLIC_CAMPAIGN_QUERY);
      return {precastCampaigns:[{
        id:'C1',name:'Registration',status:'OPEN',language:'EN',openCount:2,
        scenario:{title:'Cosa Nostra',scenarioVersions_on_scenario:[
          {id:'V1',status:'READY',playerSummary:'Chicago, 1928.'}
        ]},
        precastRegistrations_on_campaign:[],
      }]};
    },
    executor:async(operation,variables)=>{writes.push({operation,variables});return{};},
    now:new Date('2026-10-06T08:00:00Z'),
  });
  assert.equal(campaign.scenario.title,'Cosa Nostra');
  assert.equal(campaign.scenario.playerSummary,'Chicago, 1928.');
  assert.equal(writes[0].operation,__precastOps.TRACK_CAMPAIGN_OPEN_MUTATION);
  assert.equal(writes[0].variables.count,3);
});

test('new public registration is stored independently from session participants', async()=>{
  const writes=[];
  const result=await submitPublicPrecastRegistration('B'.repeat(32),{
    displayName:'Alice',
    email:'Alice@example.com',
    ageBracket:'26_40',
    genderPreference:'FEMININ',
    desiredInvolvement:'TRES_IMPLIQUE',
    notes:'Likes investigation',
  },{
    reader:async()=>({precastCampaigns:[{
      id:'C1',status:'OPEN',submissionCount:4,
      precastRegistrations_on_campaign:[],
      scenario:{scenarioVersions_on_scenario:[]},
    }]}),
    executor:async(operation,variables)=>{writes.push({operation,variables});return{};},
    now:new Date('2026-10-06T08:00:00Z'),
  });
  assert.equal(result.updated,false);
  assert.equal(writes[0].operation,__precastOps.INSERT_REGISTRATION_MUTATION);
  assert.equal(writes[0].variables.data.campaignId,'C1');
  assert.equal(writes[0].variables.data.email,'alice@example.com');
  assert.equal(writes[1].operation,__precastOps.UPDATE_CAMPAIGN_SUBMISSION_COUNT_MUTATION);
  assert.equal(writes[1].variables.count,5);
});

test('same email updates the existing pre-casting registration', async()=>{
  const writes=[];
  const result=await submitPublicPrecastRegistration('C'.repeat(32),{
    displayName:'Alice Updated',
    email:'alice@example.com',
    ageBracket:'26_40',
    genderPreference:'SANS_PREFERENCE',
    desiredInvolvement:'ACTIF',
  },{
    reader:async()=>({precastCampaigns:[{
      id:'C1',status:'OPEN',submissionCount:1,
      precastRegistrations_on_campaign:[{
        id:'R1',email:'alice@example.com',active:true,status:'REGISTERED'
      }],
      scenario:{scenarioVersions_on_scenario:[]},
    }]}),
    executor:async(operation,variables)=>{writes.push({operation,variables});return{};},
  });
  assert.equal(result.updated,true);
  assert.equal(writes.length,1);
  assert.equal(writes[0].operation,__precastOps.UPDATE_REGISTRATION_MUTATION);
  assert.equal(writes[0].variables.registrationId,'R1');
});

test('selected registrations create a session and are then marked transferred', async()=>{
  const writes=[];
  const createdParticipants=[];
  const fakeCampaign={
    id:'C1',name:'Cosa inscriptions',token:'x',language:'EN',status:'CLOSED',
    plannedAt:null,venueHint:null,publicNote:null,openCount:0,submissionCount:2,
    scenario:{id:'SC1',title:'Cosa Nostra'},
    counts:{registrations:2,available:2,transferred:0,femininePreference:1,masculinePreference:1,noPreference:0,highInvolvement:0},
    versions:[{
      id:'V15',versionLabel:'2.3',variantName:'15 players',language:'EN',status:'READY',
      minPlayers:2,maxPlayers:2,playableCharacters:2,
      genderComposition:{feminine:1,masculine:1,flexible:0,total:2},
    }],
    registrations:[
      {id:'R1',displayName:'Alice',email:'a@example.com',ageBracket:'26_40',genderPreference:'FEMININ',desiredInvolvement:'ACTIF',status:'REGISTERED',active:true},
      {id:'R2',displayName:'Bob',email:'b@example.com',ageBracket:'26_40',genderPreference:'MASCULIN',desiredInvolvement:'ACTIF',status:'REGISTERED',active:true},
    ],
  };

  const result=await createSessionFromPrecast('C1',{
    versionId:'V15',
    registrationIds:['R1','R2'],
    name:'Cosa — 12 Oct',
    language:'EN',
  },{
    reader:async operation=>{
      assert.equal(operation,__precastOps.GET_CAMPAIGN_QUERY);
      return {precastCampaign:{
        id:fakeCampaign.id,name:fakeCampaign.name,token:fakeCampaign.token,language:fakeCampaign.language,status:fakeCampaign.status,
        scenario:{
          id:'SC1',title:'Cosa Nostra',
          scenarioVersions_on_scenario:[{
            id:'V15',versionLabel:'2.3',variantName:'15 players',language:'EN',status:'READY',minPlayers:2,maxPlayers:2,
            characters_on_scenarioVersion:[
              {externalId:'A',gender:'FEMININ',playable:true,active:true},
              {externalId:'B',gender:'MASCULIN',playable:true,active:true},
            ],
          }],
        },
        precastRegistrations_on_campaign:fakeCampaign.registrations,
      }};
    },
    executor:async(operation,variables)=>{writes.push({operation,variables});return{};},
    sessionCreator:async input=>({id:'S1',name:input.name,status:'DRAFT'}),
    participantAdder:async(sessionId,input)=>{createdParticipants.push({sessionId,input});return{id:'P'};},
    now:new Date('2026-10-06T08:00:00Z'),
  });

  assert.equal(result.session.id,'S1');
  assert.equal(result.transferred,2);
  assert.equal(createdParticipants.length,2);
  assert.equal(createdParticipants[0].input.email,'a@example.com');
  assert.equal(writes.length,2);
  assert.ok(writes.every(x=>x.operation===__precastOps.MARK_REGISTRATION_TRANSFERRED_MUTATION));
  assert.ok(writes.every(x=>x.variables.sessionId==='S1'));
});
