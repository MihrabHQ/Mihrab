import org.gradle.api.tasks.testing.logging.TestExceptionFormat

// Compiles the app's own contract sources — the same files the Android app
// builds — against Maven's org.json, and runs them over the golden fixtures.
// The contract code touches only org.json and java.util, which is what makes
// a plain JVM an honest stand-in for the device here.
plugins {
  kotlin("jvm") version "2.1.20"
}

repositories {
  mavenCentral()
}

dependencies {
  implementation("org.json:json:20180813")
  testImplementation("junit:junit:4.12")
}

sourceSets {
  main {
    kotlin.srcDir("../../android/app/src/main/java/com/prayer_times/contract")
  }
}

tasks.test {
  // Declared as an input, not only passed as a path: otherwise Gradle calls
  // the task up to date after the fixtures change and skips it — a stale
  // green that hid a deliberately broken fixture the first time round.
  inputs.file("../fixtures.json")
  systemProperty("contract.fixtures", file("../fixtures.json").absolutePath)
  testLogging {
    events("failed")
    exceptionFormat = TestExceptionFormat.FULL
    showStandardStreams = false
  }
}
