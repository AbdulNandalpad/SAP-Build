using { c4c } from './external/opportunity';

service OpportunityService {
    @readonly entity Opportunities as projection on c4c.OpportunityCollection;
}

service AIService {
    action analyze(question: String, summary: String) returns String;
    action buildReport(question: String, data: String) returns String;
    action generateBrief(audience: String, intent: String, data: String) returns String;
}

service QuoteService {
    @readonly entity SalesQuotes as projection on c4c.OpportunityCollection;
}