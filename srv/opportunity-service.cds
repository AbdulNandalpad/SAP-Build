using { c4c } from './external/opportunity';

@path: 'opportunity'
service OpportunityService {
    @readonly entity Opportunities as projection on c4c.OpportunityCollection;
}
