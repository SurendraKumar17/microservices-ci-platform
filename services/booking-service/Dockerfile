FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
# The CI pipeline builds the jar in an earlier step (mvn package) and downloads
# it back into target/ before this Docker build runs - see _reusable-java-ci.yml
COPY target/booking-service.jar app.jar
EXPOSE 8080
CMD ["java", "-jar", "app.jar"]