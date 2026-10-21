public class Main {
    public static void main(String[] args) {
        String reportId = "RSQ-1001";
        String disasterType = "Flood";
        int peopleAffected = 25;
        int score = 68;

        System.out.println("RESQ Disaster Report");
        System.out.println("--------------------");
        System.out.println("Report ID: " + reportId);
        System.out.println("Disaster: " + disasterType);
        System.out.println("People affected: " + peopleAffected);
        System.out.println("Severity score: " + score);

        if (score >= 76) {
            System.out.println("Severity: CRITICAL");
        } else if (score >= 51) {
            System.out.println("Severity: HIGH");
        } else if (score >= 26) {
            System.out.println("Severity: MODERATE");
        } else {
            System.out.println("Severity: LOW");
        }
    }
}