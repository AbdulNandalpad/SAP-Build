using { c4c } from './external/opportunity';

service QuoteService {
    @readonly entity SalesQuotes as projection on c4c.SalesQuoteCollection;
}
