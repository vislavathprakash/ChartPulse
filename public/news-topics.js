/* One topic catalogue shared by News filters, alert forms and server validation. */
((root)=>{
  const categories={
    earnings:'Results & earnings',dividends:'Dividends',board:'Board meetings',ipo:'IPO & public offers',actions:'Corporate actions',
    buybacks:'Buybacks',bonus:'Bonus issues',splits:'Stock splits',rights:'Rights issues',fundraising:'Fund-raising & QIP',
    mergers:'Mergers & acquisitions',contracts:'Orders & contracts',capex:'Expansion & capital expenditure',guidance:'Business outlook & guidance',products:'Products & partnerships',
    debt:'Bonds, debt & redemptions',listings:'Listings & delistings',annual:'Annual reports',
    insider:'Insider transactions',shareholding:'Promoter & shareholding changes',pledges:'Share pledges',management:'Management changes',governance:'Governance & compliance',
    audits:'Auditors & audit updates',litigation:'Legal & regulatory actions',esg:'Sustainability & ESG',investor:'Investor & analyst meetings',ratings:'Credit ratings',
    market:'Market & policy',rates:'Interest rates & monetary policy',banking:'Banking & payments',forex:'Currency & foreign exchange',commodities:'Commodities & bullion',
    economy:'Economy, inflation & GDP',global:'Global market developments',derivatives:'Futures & options',funds:'Mutual funds & ETFs',holidays:'Exchange notices & holidays',announcements:'Other announcements'
  };
  const groups={
    'Company events':['earnings','dividends','board','ipo','actions','buybacks','bonus','splits','rights','fundraising','mergers','contracts','capex','guidance','products','debt','listings','annual'],
    'Ownership & governance':['insider','shareholding','pledges','management','governance','audits','litigation','esg','investor','ratings'],
    'Markets & economy':['market','rates','banking','forex','commodities','economy','global','derivatives','funds','holidays','announcements']
  };
  const topics={categories,groups};
  if(typeof module==='object'&&module.exports)module.exports=topics;else root.alertPeNewsTopics=topics;
})(typeof window==='object'?window:null);
