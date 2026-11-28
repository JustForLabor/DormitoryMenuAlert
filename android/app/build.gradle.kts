import java.util.Properties

plugins {
    id("com.android.application")
}

// 웹 앱 주소. 에뮬레이터에서 로컬 서버로 시험할 때: ./gradlew assembleDebug -PbaseUrl=http://10.0.2.2:3917
val baseUrl = (findProperty("baseUrl") as String?) ?: "https://dorm.ybkim.pe.kr"

// 서명 키는 저장소 밖에 둔다: keystore.properties (storeFile, storePassword, keyAlias, keyPassword)
val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "kr.pe.ybkim.ssaltech"
    compileSdk = 34

    defaultConfig {
        applicationId = "kr.pe.ybkim.ssaltech"
        minSdk = 26
        targetSdk = 34
        versionCode = (findProperty("versionCode") as String?)?.toInt() ?: 5
        versionName = (findProperty("versionName") as String?) ?: "1.2.1"
        buildConfigField("String", "BASE_URL", "\"$baseUrl\"")
        manifestPlaceholders["cleartext"] = baseUrl.startsWith("http://").toString()
    }

    signingConfigs {
        if (keystoreProps.isNotEmpty()) {
            create("release") {
                storeFile = file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (keystoreProps.isNotEmpty()) signingConfig = signingConfigs.getByName("release")
        }
        debug {
            if (keystoreProps.isNotEmpty()) signingConfig = signingConfigs.getByName("release")
        }
    }
    buildFeatures {
        buildConfig = true
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
