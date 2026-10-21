import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

public class ResqConsole {

    enum Severity {
        LOW, MODERATE, HIGH, CRITICAL
    }

    enum DisasterType {
        FLOOD(18),
        FIRE(16),
        EARTHQUAKE(18),
        CYCLONE(15),
        LANDSLIDE(14),
        INDUSTRIAL_ACCIDENT(17),
        MEDICAL_EMERGENCY(10),
        UNKNOWN(8);

        private final int hazardScore;

        DisasterType(int hazardScore) {
            this.hazardScore = hazardScore;
        }

        public int hazardScore() {
            return hazardScore;
        }
    }

    enum IncidentStatus {
        SUBMITTED,
        UNDER_REVIEW,
        VERIFIED,
        RESPONSE_ASSIGNED,
        IN_PROGRESS,
        RESOLVED,
        REJECTED
    }

    static class Location {
        private final String address;
        private final double latitude;
        private final double longitude;

        Location(String address, double latitude, double longitude) {
            this.address = address;
            this.latitude = latitude;
            this.longitude = longitude;
        }

        @Override
        public String toString() {
            return address + " (" + latitude + ", " + longitude + ")";
        }
    }

    static class DisasterReport {
        private final String id;
        private final DisasterType type;
        private final String description;
        private final Location location;
        private final int peopleAffected;
        private final int urgency;
        private final LocalDateTime createdAt;

        private IncidentStatus status;
        private Assessment assessment;

        DisasterReport(
                String id,
                DisasterType type,
                String description,
                Location location,
                int peopleAffected,
                int urgency
        ) {
            if (peopleAffected < 0) {
                throw new IllegalArgumentException("People affected cannot be negative");
            }

            if (urgency < 1 || urgency > 5) {
                throw new IllegalArgumentException("Urgency must be between 1 and 5");
            }

            this.id = id;
            this.type = type;
            this.description = description;
            this.location = location;
            this.peopleAffected = peopleAffected;
            this.urgency = urgency;
            this.createdAt = LocalDateTime.now();
            this.status = IncidentStatus.SUBMITTED;
        }

        public String getId() {
            return id;
        }

        public DisasterType getType() {
            return type;
        }

        public String getDescription() {
            return description;
        }

        public int getPeopleAffected() {
            return peopleAffected;
        }

        public int getUrgency() {
            return urgency;
        }

        public IncidentStatus getStatus() {
            return status;
        }

        public void setAssessment(Assessment assessment) {
            this.assessment = assessment;
        }

        public Assessment getAssessment() {
            return assessment;
        }

        public void changeStatus(IncidentStatus newStatus) {
            if (!isValidTransition(status, newStatus)) {
                throw new IllegalStateException(
                        "Invalid transition from " + status + " to " + newStatus
                );
            }

            this.status = newStatus;
        }

        private boolean isValidTransition(
                IncidentStatus current,
                IncidentStatus next
        ) {
            return switch (current) {
                case SUBMITTED ->
                        next == IncidentStatus.UNDER_REVIEW ||
                        next == IncidentStatus.REJECTED;

                case UNDER_REVIEW ->
                        next == IncidentStatus.VERIFIED ||
                        next == IncidentStatus.REJECTED;

                case VERIFIED ->
                        next == IncidentStatus.RESPONSE_ASSIGNED ||
                        next == IncidentStatus.REJECTED;

                case RESPONSE_ASSIGNED ->
                        next == IncidentStatus.IN_PROGRESS;

                case IN_PROGRESS ->
                        next == IncidentStatus.RESOLVED;

                case RESOLVED, REJECTED -> false;
            };
        }

        @Override
        public String toString() {
            return id + " | " + type + " | " + status + " | " + location;
        }
    }

    static class Assessment {
        private final int score;
        private final Severity severity;
        private final List<String> riskFactors;
        private final List<String> recommendedActions;

        Assessment(
                int score,
                Severity severity,
                List<String> riskFactors,
                List<String> recommendedActions
        ) {
            this.score = score;
            this.severity = severity;
            this.riskFactors = riskFactors;
            this.recommendedActions = recommendedActions;
        }

        public int getScore() {
            return score;
        }

        public Severity getSeverity() {
            return severity;
        }

        public List<String> getRiskFactors() {
            return riskFactors;
        }

        public List<String> getRecommendedActions() {
            return recommendedActions;
        }

        @Override
        public String toString() {
            return """
                    Score: %d/100
                    Severity: %s
                    Risk factors:
                    %s
                    Recommended actions:
                    %s
                    """.formatted(
                    score,
                    severity,
                    formatList(riskFactors),
                    formatList(recommendedActions)
            );
        }

        private String formatList(List<String> values) {
            return values.stream()
                    .map(value -> " - " + value)
                    .collect(Collectors.joining("\n"));
        }
    }

    static class AssessmentEngine {

        Assessment assess(DisasterReport report) {
            int score = 0;
            List<String> risks = new ArrayList<>();
            List<String> actions = new ArrayList<>();

            score += report.getType().hazardScore();

            int urgencyScore = report.getUrgency() * 5;
            score += urgencyScore;

            int peopleScore = calculatePeopleScore(report.getPeopleAffected());
            score += peopleScore;

            int situationScore = calculateSituationScore(
                    report.getDescription(),
                    risks,
                    actions
            );
            score += situationScore;

            if (report.getPeopleAffected() >= 100) {
                risks.add("Large number of people affected");
                actions.add("Request additional medical and rescue teams");
            }

            if (report.getType() == DisasterType.FLOOD) {
                actions.add("Check evacuation routes and nearby shelters");
            }

            if (report.getType() == DisasterType.FIRE) {
                actions.add("Dispatch fire and rescue services");
            }

            if (report.getType() == DisasterType.EARTHQUAKE) {
                actions.add("Inspect buildings for structural damage");
            }

            score = Math.min(score, 100);

            Severity severity = determineSeverity(score);

            if (severity == Severity.CRITICAL) {
                actions.add("Escalate immediately to the emergency coordinator");
            }

            return new Assessment(score, severity, risks, actions);
        }

        private int calculatePeopleScore(int peopleAffected) {
            if (peopleAffected == 0) return 0;
            if (peopleAffected <= 5) return 4;
            if (peopleAffected <= 25) return 10;
            if (peopleAffected <= 100) return 17;
            if (peopleAffected <= 500) return 22;
            return 24;
        }

        private int calculateSituationScore(
                String description,
                List<String> risks,
                List<String> actions
        ) {
            String text = description.toLowerCase();
            int score = 0;

            Map<String, Integer> indicators = new LinkedHashMap<>();
            indicators.put("trapped", 6);
            indicators.put("injured", 5);
            indicators.put("missing", 6);
            indicators.put("collapsed", 7);
            indicators.put("smoke", 4);
            indicators.put("rising water", 6);
            indicators.put("blocked road", 4);
            indicators.put("urgent", 3);

            for (Map.Entry<String, Integer> entry : indicators.entrySet()) {
                if (text.contains(entry.getKey())) {
                    score += entry.getValue();
                    risks.add("Situation indicates: " + entry.getKey());
                }
            }

            if (score > 0) {
                actions.add("Verify reported conditions with field responders");
            }

            return Math.min(score, 24);
        }

        private Severity determineSeverity(int score) {
            if (score <= 25) return Severity.LOW;
            if (score <= 50) return Severity.MODERATE;
            if (score <= 75) return Severity.HIGH;
            return Severity.CRITICAL;
        }
    }

    static class IncidentRegistry {
        private final Map<String, DisasterReport> reports = new LinkedHashMap<>();

        void add(DisasterReport report) {
            if (reports.containsKey(report.getId())) {
                throw new IllegalArgumentException("Report ID already exists");
            }

            reports.put(report.getId(), report);
        }

        DisasterReport find(String id) {
            DisasterReport report = reports.get(id);

            if (report == null) {
                throw new NoSuchElementException("Report not found: " + id);
            }

            return report;
        }

        List<DisasterReport> findBySeverity(Severity severity) {
            return reports.values()
                    .stream()
                    .filter(report ->
                            report.getAssessment() != null &&
                            report.getAssessment().getSeverity() == severity
                    )
                    .toList();
        }

        void printSummary() {
            System.out.println("\nIncident Summary");

            for (DisasterReport report : reports.values()) {
                String assessmentText = report.getAssessment() == null
                        ? "Not assessed"
                        : report.getAssessment().getSeverity()
                          + " (" + report.getAssessment().getScore() + ")";

                System.out.println(
                        report.getId()
                                + " | "
                                + report.getType()
                                + " | "
                                + assessmentText
                                + " | "
                                + report.getStatus()
                );
            }
        }
    }

    public static void main(String[] args) {
        AssessmentEngine engine = new AssessmentEngine();
        IncidentRegistry registry = new IncidentRegistry();

        DisasterReport floodReport = new DisasterReport(
                "RSQ-1001",
                DisasterType.FLOOD,
                "Rising water has trapped several families. The road is blocked "
                        + "and two people are injured.",
                new Location("Sanaur Road", 30.2812, 76.4571),
                145,
                5
        );

        DisasterReport fireReport = new DisasterReport(
                "RSQ-1002",
                DisasterType.FIRE,
                "Smoke is visible from an industrial building. Workers may be "
                        + "missing inside.",
                new Location("Industrial Area", 30.3398, 76.3869),
                42,
                4
        );

        DisasterReport medicalReport = new DisasterReport(
                "RSQ-1003",
                DisasterType.MEDICAL_EMERGENCY,
                "One person requires urgent medical attention.",
                new Location("Model Town", 30.3290, 76.3950),
                1,
                3
        );

        List<DisasterReport> reports = List.of(
                floodReport,
                fireReport,
                medicalReport
        );

        for (DisasterReport report : reports) {
            registry.add(report);

            Assessment assessment = engine.assess(report);
            report.setAssessment(assessment);

            report.changeStatus(IncidentStatus.UNDER_REVIEW);
            report.changeStatus(IncidentStatus.VERIFIED);

            if (assessment.getSeverity() == Severity.CRITICAL ||
                    assessment.getSeverity() == Severity.HIGH) {
                report.changeStatus(IncidentStatus.RESPONSE_ASSIGNED);
                report.changeStatus(IncidentStatus.IN_PROGRESS);
            }

            System.out.println("\n=================================");
            System.out.println("Report: " + report.getId());
            System.out.println("Type: " + report.getType());
            System.out.println("Status: " + report.getStatus());
            System.out.println(report.getAssessment());
        }

        registry.printSummary();

        System.out.println("\nCritical incidents:");
        registry.findBySeverity(Severity.CRITICAL)
                .forEach(report -> System.out.println(report.getId()));
    }
}