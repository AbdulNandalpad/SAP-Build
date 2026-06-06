using { c4c } from './external/opportunity';

@path: 'quotes'
service QuoteService {
    @readonly entity SalesQuotes as projection on c4c.SalesQuoteCollection;
}
