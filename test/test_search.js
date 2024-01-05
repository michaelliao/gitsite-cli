import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { createIndex, tokenizer, search, exportIndex } from '../bin/search.js';

const en = `React Native is an open-source UI software framework created by Meta. It is used to develop applications for Android, iOS, macOS and Windows by enabling developers to use the React framework along with native platform capabilities.`;
const fr = `React Native est un framework logiciel open source créé par Meta. Il est utilisé pour développer des applications pour Android, iOS, macOS et Windows en permettant aux développeurs d'utiliser le framework React ainsi que les capacités natives de la plateforme.`;
const de = `React Native ist ein Open-Source UI-Software-Framework, das von Meta erstellt wurde. Es wird verwendet, um Anwendungen für Android, iOS, macOS und Windows zu entwickeln, indem es Entwicklern ermöglicht, das React-Framework zusammen mit nativen Plattformfunktionen zu nutzen.`;
const el = `Το React Native είναι ένα open-source πλαίσιο λογισμικού διεπαφής χρήστη που δημιουργήθηκε από την Meta. Χρησιμοποιείται για την ανάπτυξη εφαρμογών για το Android, το iOS, το macOS και τα Windows επιτρέποντας στους προγραμματιστές να χρησιμοποιούν το πλαίσιο React μαζί με τις φυσικές δυνατότητες της πλατφόρμας.`;
const ru = `Реакт Натив (React Native) - это открытая программная платформа для создания пользовательских интерфейсов (UI), созданная компанией Мета (Meta). Она используется для разработки приложений для Android, iOS, macOS и Windows, позволяя разработчикам использовать фреймворк React вместе с возможностями нативной платформы.`;
const ja = `React NativeはMetaによって作成されたオープンソースのUIソフトウェアフレームワークであり、開発者がReactフレームワークとネイティブプラットフォームの機能を使用できるようにすることによって、Android、iOS、macOS、およびWindows向けのアプリケーションを開発するために使用されます。`;
const ko = `React Native는 Meta에서 만든 오픈 소스 UI 소프트웨어 프레임워크입니다. 개발자가 기본 플랫폼 기능과 함께 React 프레임워크를 사용할 수 있도록 하여 Android, iOS, macOS 및 Windows용 애플리케이션을 개발하는 데 사용됩니다.`;
const th = `React Native เป็นเฟรมเวิร์กซอฟต์แวร์เพื่อสร้างอินเทอร์เฟซผู้ใช้เปิดโค้งที่สร้างขึ้นโดย Meta มันใช้ในการพัฒนาแอปพลิเคชันสำหรับ Android, iOS, macOS และ Windows โดยทำให้นักพัฒนาสามารถใช้กรอบการทำงาน React พร้อมกับความสามารถของแพลตฟอร์มแบบชั้นเส้นได้`;
const zh = `React Native是由Meta创建的开源UI软件框架。它用于开发Android、iOS、macOS和Windows应用程序，使开发人员能够利用React框架以及本地平台功能。`;
const zh_tw = `React Native是由Meta創建的開源UI軟體框架。它用於開發Android、iOS、macOS和Windows應用程式，讓開發人員能夠使用React框架以及本地平台功能。`;

test('tokenizer', () => {
    assert.deepEqual(tokenizer(en), ['react', 'native', 'is', 'an', 'open', 'source', 'ui', 'software', 'framework', 'created', 'by', 'meta', 'it', 'is', 'used', 'to', 'develop', 'applications', 'for', 'android', 'ios', 'macos', 'and', 'windows', 'by', 'enabling', 'developers', 'to', 'use', 'the', 'react', 'framework', 'along', 'with', 'native', 'platform', 'capabilities']);
    assert.deepEqual(tokenizer(fr), ['react', 'native', 'est', 'un', 'framework', 'logiciel', 'open', 'source', 'créé', 'par', 'meta', 'il', 'est', 'utilisé', 'pour', 'développer', 'des', 'applications', 'pour', 'android', 'ios', 'macos', 'et', 'windows', 'en', 'permettant', 'aux', 'développeurs', 'utiliser', 'le', 'framework', 'react', 'ainsi', 'que', 'les', 'capacités', 'natives', 'de', 'la', 'plateforme']);
    assert.deepEqual(tokenizer(de), ['react', 'native', 'ist', 'ein', 'open', 'source', 'ui', 'software', 'framework', 'das', 'von', 'meta', 'erstellt', 'wurde', 'es', 'wird', 'verwendet', 'um', 'anwendungen', 'für', 'android', 'ios', 'macos', 'und', 'windows', 'zu', 'entwickeln', 'indem', 'es', 'entwicklern', 'ermöglicht', 'das', 'react', 'framework', 'zusammen', 'mit', 'nativen', 'plattformfunktionen', 'zu', 'nutzen']);
    assert.deepEqual(tokenizer(el), ['το', 'react', 'native', 'είναι', 'ένα', 'open', 'source', 'πλαίσιο', 'λογισμικού', 'διεπαφής', 'χρήστη', 'που', 'δημιουργήθηκε', 'από', 'την', 'meta', 'χρησιμοποιείται', 'για', 'την', 'ανάπτυξη', 'εφαρμογών', 'για', 'το', 'android', 'το', 'ios', 'το', 'macos', 'και', 'τα', 'windows', 'επιτρέποντας', 'στους', 'προγραμματιστές', 'να', 'χρησιμοποιούν', 'το', 'πλαίσιο', 'react', 'μαζί', 'με', 'τις', 'φυσικές', 'δυνατότητες', 'της', 'πλατφόρμας']);
    assert.deepEqual(tokenizer(ru), ['реакт', 'натив', 'react', 'native', 'это', 'открытая', 'программная', 'платформа', 'для', 'создания', 'пользовательских', 'интерфейсов', 'ui', 'созданная', 'компанией', 'мета', 'meta', 'она', 'используется', 'для', 'разработки', 'приложений', 'для', 'android', 'ios', 'macos', 'windows', 'позволяя', 'разработчикам', 'использовать', 'фреймворк', 'react', 'вместе', 'возможностями', 'нативной', 'платформы']);
    assert.deepEqual(tokenizer(ja), ['react', 'native', 'は', 'meta', 'に', 'よ', 'っ', 'て', '作', '成', 'さ', 'れ', 'た', 'の', 'ui', 'で', 'あ', 'り', '開', '発', '者', 'が', 'react', 'と', 'の', '機', '能', 'を', '使', '用', 'で', 'き', 'る', 'よ', 'う', 'に', 'す', 'る', 'こ', 'と', 'に', 'よ', 'っ', 'て', 'android', 'ios', 'macos', 'お', 'よ', 'び', 'windows', '向', 'け', 'の', 'を', '開', '発', 'す', 'る', 'た', 'め', 'に', '使', '用', 'さ', 'れ', 'ま', 'す']);
    assert.deepEqual(tokenizer(ko), ['react', 'native', '는', 'meta', '에', '서', '만', '든', '오', '픈', '소', '스', 'ui', '소', '프', '트', '웨', '어', '프', '레', '임', '워', '크', '입', '니', '다', '개', '발', '자', '가', '기', '본', '플', '랫', '폼', '기', '능', '과', '함', '께', 'react', '프', '레', '임', '워', '크', '를', '사', '용', '할', '수', '있', '도', '록', '하', '여', 'android', 'ios', 'macos', '및', 'windows', '용', '애', '플', '리', '케', '이', '션', '을', '개', '발', '하', '는', '데', '사', '용', '됩', '니', '다']);
    assert.deepEqual(tokenizer(th), ['react', 'native', 'เ', 'ป', '็', 'น', 'เ', 'ฟ', 'ร', 'ม', 'เ', 'ว', 'ิ', 'ร', '์', 'ก', 'ซ', 'อ', 'ฟ', 'ต', '์', 'แ', 'ว', 'ร', '์', 'เ', 'พ', 'ื', '่', 'อ', 'ส', 'ร', '้', 'า', 'ง', 'อ', 'ิ', 'น', 'เ', 'ท', 'อ', 'ร', '์', 'เ', 'ฟ', 'ซ', 'ผ', 'ู', '้', 'ใ', 'ช', '้', 'เ', 'ป', 'ิ', 'ด', 'โ', 'ค', '้', 'ง', 'ท', 'ี', '่', 'ส', 'ร', '้', 'า', 'ง', 'ข', 'ึ', '้', 'น', 'โ', 'ด', 'ย', 'meta', 'ม', 'ั', 'น', 'ใ', 'ช', '้', 'ใ', 'น', 'ก', 'า', 'ร', 'พ', 'ั', 'ฒ', 'น', 'า', 'แ', 'อ', 'ป', 'พ', 'ล', 'ิ', 'เ', 'ค', 'ช', 'ั', 'น', 'ส', 'ำ', 'ห', 'ร', 'ั', 'บ', 'android', 'ios', 'macos', 'แ', 'ล', 'ะ', 'windows', 'โ', 'ด', 'ย', 'ท', 'ำ', 'ใ', 'ห', '้', 'น', 'ั', 'ก', 'พ', 'ั', 'ฒ', 'น', 'า', 'ส', 'า', 'ม', 'า', 'ร', 'ถ', 'ใ', 'ช', '้', 'ก', 'ร', 'อ', 'บ', 'ก', 'า', 'ร', 'ท', 'ำ', 'ง', 'า', 'น', 'react', 'พ', 'ร', '้', 'อ', 'ม', 'ก', 'ั', 'บ', 'ค', 'ว', 'า', 'ม', 'ส', 'า', 'ม', 'า', 'ร', 'ถ', 'ข', 'อ', 'ง', 'แ', 'พ', 'ล', 'ต', 'ฟ', 'อ', 'ร', '์', 'ม', 'แ', 'บ', 'บ', 'ช', 'ั', '้', 'น', 'เ', 'ส', '้', 'น', 'ไ', 'ด', '้']);
    assert.deepEqual(tokenizer(zh), ['react', 'native', '是', '由', 'meta', '创', '建', '的', '开', '源', 'ui', '软', '件', '框', '架', '它', '用', '于', '开', '发', 'android', 'ios', 'macos', '和', 'windows', '应', '用', '程', '序', '使', '开', '发', '人', '员', '能', '够', '利', '用', 'react', '框', '架', '以', '及', '本', '地', '平', '台', '功', '能']);
    assert.deepEqual(tokenizer(zh_tw), ['react', 'native', '是', '由', 'meta', '創', '建', '的', '開', '源', 'ui', '軟', '體', '框', '架', '它', '用', '於', '開', '發', 'android', 'ios', 'macos', '和', 'windows', '應', '用', '程', '式', '讓', '開', '發', '人', '員', '能', '夠', '使', '用', 'react', '框', '架', '以', '及', '本', '地', '平', '台', '功', '能']);
});

test('search', () => {
    const docs = [
        {
            id: 0,
            title: 'What is React Native',
            content: en
        },
        {
            id: 1,
            title: 'React Native简介',
            content: zh
        },
        {
            id: 2,
            title: '「React Native」の紹介',
            content: ja
        }
    ];
    const index = createIndex(docs);
    assert.deepEqual(search(index, 'native'), [0, 1, 2]);
    assert.deepEqual(search(index, '软件框架'), [1]);
    assert.deepEqual(search(index, '使用'), [2, 1]);
});
