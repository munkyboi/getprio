require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {NamedExtraMembers,namedExtraMemberIssue,canApplyNamedExtraMembers}=require('../src/vendor/NamedExtraMembers.tsx');
const available=id=>({id,name:`Trainer ${id}`,eligible:true,availability:'available'});
const members=[available('one'),available('two'),available('three'),{...available('busy'),availability:'unavailable',reason:'Already in service'},{...available('unknown'),availability:'unknown',reason:'Interval not checked'},{...available('archived'),eligible:false,availability:'unavailable'}];
test('named-extra cap permits removal but rejects third, duplicate and unavailable new picks',()=>{
 assert.equal(canApplyNamedExtraMembers(['one'],['one','two'],'2',members),true);
 assert.equal(canApplyNamedExtraMembers(['one','two'],['one','two','three'],'2',members),false);
 assert.equal(canApplyNamedExtraMembers(['one'],['one','one'],'2',members),false);
 for(const id of ['busy','unknown','archived'])assert.equal(canApplyNamedExtraMembers([], [id],'1',members),false);
 assert.equal(canApplyNamedExtraMembers(['one','two'],['two'],'1',members),true);
 assert.equal(canApplyNamedExtraMembers(['busy'],[],'0',members),true);
});
test('exact count/catalog issues stay distinct from temporary availability so requests can wait',()=>{
 assert.equal(namedExtraMemberIssue(['one','two'],'2',members),undefined);
 assert.match(namedExtraMemberIssue(['one'],'2',members),/Choose exactly 2/);
 assert.match(namedExtraMemberIssue(['one','two'],'1',members),/2 selected/);
 assert.match(namedExtraMemberIssue(['archived'],'1',members),/no longer available/);
 assert.equal(namedExtraMemberIssue(['busy'],'1',members),undefined);
 assert.equal(namedExtraMemberIssue(['unknown'],'1',members),undefined);
});
test('quantity reduction retains chosen chips and unavailable selections remain explicit',()=>{
 const props={label:'Trainer names',context:'service 1, resource 1, extra 1',members,quantity:'1',busy:false,onChange(){}};
 const reduced=renderToStaticMarkup(React.createElement(NamedExtraMembers,{...props,selectedIds:['one','two']}));
 assert.match(reduced,/Trainer one/);assert.match(reduced,/Trainer two/);assert.match(reduced,/2\/1 selected/);assert.match(reduced,/aria-invalid="true"/);
 const stale=renderToStaticMarkup(React.createElement(NamedExtraMembers,{...props,selectedIds:['busy']}));
 assert.match(stale,/Already in service/);assert.match(stale,/Availability changed/);assert.doesNotMatch(stale,/aria-invalid="true"/);
});
