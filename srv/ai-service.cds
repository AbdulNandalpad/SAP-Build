@path: 'ai'
service AIService {
    action analyze(question: String, summary: String) returns String;
    action buildReport(question: String, data: String) returns String;
    action generateBrief(audience: String, intent: String, data: String) returns String;
    action getSnapshot() returns String;
    action refreshSnapshot() returns String;
}
